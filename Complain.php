<?php
// This block of PHP code handles the form submission when a POST request is made to this file.
// It must be at the very top of the file before any HTML output.

// Check if the request method is POST
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    // Set the content type to JSON for the response
    header('Content-Type: application/json');

    // Initialize a response array
    $response = array('success' => false, 'message' => 'An error occurred.');

    // Database credentials - REPLACE WITH YOUR ACTUAL CREDENTIALS
    $servername = "localhost"; // Database server name (usually localhost)
    $username = "root"; // Your MySQL username
    $password = "password"; // Your MySQL password
    $dbname = "complaint_db"; // The name of your database
    $table_name = "complaints"; // The name of your complaints table

    // Create a new database connection
    $conn = new mysqli($servername, $username, $password, $dbname);

    // Check if the connection was successful
    if ($conn->connect_error) {
        $response['message'] = "Database Connection failed: " . $conn->connect_error;
        error_log("Database Connection failed: " . $conn->connect_error); // Log the error
        echo json_encode($response); // Output error response as JSON
        exit(); // Stop script execution
    }

    // Sanitize and retrieve form data from the POST request
    $name = isset($_POST['name']) ? $conn->real_escape_string($_POST['name']) : '';
    $village = isset($_POST['village']) ? $conn->real_escape_string($_POST['village']) : '';
    $complaint = isset($_POST['complaint']) ? $conn->real_escape_string($_POST['complaint']) : '';

    // Basic server-side validation
    if (empty(trim($name)) || empty(trim($village)) || empty(trim($complaint))) {
        $response['message'] = 'Name, Village, and Complaint are required fields.';
        echo json_encode($response);
        $conn->close();
        exit();
    }

    $image1_path = null; // Initialize image paths as null
    $image2_path = null;
    $upload_dir = 'Uploads/'; // Directory where images will be saved
    $allowed_types = ['jpg', 'jpeg', 'png']; // Allowed image file extensions
    $max_size = 2 * 1024 * 1024; // Maximum file size for images (2MB)

    // Ensure the upload directory exists and is writable
    if (!is_dir($upload_dir)) {
        if (!mkdir($upload_dir, 0777, true)) {
            $response['message'] = 'Failed to create upload directory.';
            error_log("Failed to create upload directory: " . $upload_dir);
            echo json_encode($response);
            $conn->close();
            exit();
        }
    }

    // Function to handle the upload of a single image file
    function uploadImage($file_input_name, $upload_dir, $allowed_types, $max_size) {
        if (isset($_FILES[$file_input_name]) && $_FILES[$file_input_name]['error'] === UPLOAD_ERR_OK) {
            $file = $_FILES[$file_input_name];
            $file_tmp_path = $file['tmp_name'];
            $file_name = $file['name'];
            $file_size = $file['size'];
            $file_extension = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));

            // Validate file size
            if ($file_size > $max_size) {
                error_log("File size exceeds limit for " . $file_name);
                return "Error: File size exceeds limit.";
            }

            // Validate file extension
            if (!in_array($file_extension, $allowed_types)) {
                error_log("Invalid file type attempted for upload: " . $file_extension);
                return "Error: Invalid file type.";
            }

            // Generate a unique filename
            $new_file_name = uniqid('', true) . '.' . $file_extension;
            $upload_path = $upload_dir . $new_file_name;

            // Move the uploaded file
            if (move_uploaded_file($file_tmp_path, $upload_path)) {
                return $upload_path;
            } else {
                error_log("Failed to move uploaded file: " . $file_tmp_path . " to " . $upload_path);
                return "Error: Failed to move uploaded file.";
            }
        } elseif (isset($_FILES[$file_input_name]) && $_FILES[$file_input_name]['error'] !== UPLOAD_ERR_NO_FILE) {
            error_log("File upload error for " . $file_input_name . ": " . $_FILES[$file_input_name]['error']);
            return "Error: File upload failed.";
        }

        return null;
    }

    // Handle image uploads
    $image1_upload_result = uploadImage('image1', $upload_dir, $allowed_types, $max_size);
    if (is_string($image1_upload_result) && strpos($image1_upload_result, 'Error:') === 0) {
        $response['message'] = $image1_upload_result;
        echo json_encode($response);
        $conn->close();
        exit();
    } else {
        $image1_path = $image1_upload_result;
    }

    $image2_upload_result = uploadImage('image2', $upload_dir, $allowed_types, $max_size);
    if (is_string($image2_upload_result) && strpos($image2_upload_result, 'Error:') === 0) {
        $response['message'] = $image2_upload_result;
        echo json_encode($response);
        $conn->close();
        exit();
    } else {
        $image2_path = $image2_upload_result;
    }

    // Insert data into the database
    $sql = "INSERT INTO $table_name (name, village, complaint, image1_path, image2_path, submission_time)
            VALUES (?, ?, ?, ?, ?, NOW())";
    $stmt = $conn->prepare($sql);
    if ($stmt === false) {
        $response['message'] = 'Database prepare failed: ' . $conn->error;
        error_log('Database prepare failed: ' . $conn->error);
        echo json_encode($response);
        $conn->close();
        exit();
    }

    $stmt->bind_param("sssss", $name, $village, $complaint, $image1_path, $image2_path);
    if ($stmt->execute()) {
        $response['success'] = true;
        $response['message'] = 'Complaint submitted successfully.';
        $last_id = $conn->insert_id;

        // Fetch the newly inserted complaint
        $fetch_sql = "SELECT * FROM $table_name WHERE id = ?";
        $fetch_stmt = $conn->prepare($fetch_sql);
        if ($fetch_stmt) {
            $fetch_stmt->bind_param("i", $last_id);
            $fetch_stmt->execute();
            $result = $fetch_stmt->get_result();
            if ($result && $result->num_rows > 0) {
                $response['new_complaint'] = $result->fetch_assoc();
            }
            $fetch_stmt->close();
        } else {
            error_log("Failed to prepare fetch statement for new complaint: " . $conn->error);
        }
    } else {
        $response['message'] = 'Error inserting record: ' . $stmt->error;
        error_log('Error inserting record: ' . $stmt->error);
    }

    $stmt->close();
    $conn->close();

    echo json_encode($response);
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complaint Form</title>
    <style>
        body {
            font-family: sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f4f4f4;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        h1, h2 {
            text-align: center;
            color: #333;
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 15px;
            position: relative;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input[type="text"],
        textarea {
            width: calc(100% - 18px);
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
        }
        textarea {
            resize: vertical;
            min-height: 100px;
        }
        input[type="file"] {
            padding: 8px 0;
            display: block;
            width: 100%;
        }
        button {
            display: block;
            width: 100%;
            background-color: #007bff;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
            transition: background-color 0.3s ease;
            margin-top: 20px;
        }
        button:hover {
            background-color: #0056b3;
        }
        .image-upload-container {
            display: flex;
            gap: 10px;
            margin-top: 5px;
            flex-direction: column;
        }
        .image-upload-container input[type="file"] {
            width: 100%;
        }
        small {
            display: block;
            margin-top: 5px;
            color: #777;
            font-size: 0.9em;
        }
        .complaint-list {
            margin-top: 30px;
            border-top: 1px solid #eee;
            padding-top: 20px;
        }
        .complaint-item {
            background: #f9f9f9;
            border: 1px solid #ddd;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 4px;
            word-wrap: break-word;
        }
        .complaint-item div {
            margin-bottom: 8px;
        }
        .complaint-item strong {
            color: #555;
            display: inline-block;
            margin-right: 5px;
        }
        .complaint-images {
            margin-top: 10px;
        }
        .complaint-images img {
            max-width: 80px;
            max-height: 80px;
            margin-right: 10px;
            border: 1px solid #ccc;
            padding: 3px;
            background-color: #fff;
            object-fit: cover;
            margin-bottom: 5px;
            display: inline-block;
        }
        .error {
            color: red;
            font-size: 0.8em;
            margin-top: 5px;
            display: none;
        }
        .back-link {
            display: inline-block;
            text-decoration: none;
            color: #007bff;
            padding: 8px 15px;
            border: 1px solid #007bff;
            border-radius: 4px;
            margin-bottom: 20px;
            transition: background-color 0.3s ease, color 0.3s ease;
        }
        .back-link:hover {
            background-color: #007bff;
            color: white;
        }
        @media (max-width: 480px) {
            body {
                padding: 10px;
            }
            .container {
                margin: 10px;
                padding: 15px;
            }
            .image-upload-container {
                flex-direction: column;
            }
            .complaint-images img {
                max-width: 60px;
                max-height: 60px;
            }
            .back-link {
                width: 100%;
                text-align: center;
            }
        }
        @media (min-width: 481px) and (max-width: 768px) {
            .container {
                padding: 15px 20px;
                margin: 15px auto;
            }
            .image-upload-container {
                flex-direction: column;
            }
            .complaint-images img {
                max-width: 70px;
                max-height: 70px;
            }
        }
        @media (min-width: 769px) {
            .container {
                padding: 20px 30px;
            }
            .image-upload-container {
                flex-direction: row;
            }
            .complaint-images img {
                max-width: 100px;
                max-height: 100px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="home.html" class="back-link">Back to Home</a>
        <h1>Complaint Form</h1>
        <form id="complaintForm" action="complain.php" method="POST" enctype="multipart/form-data">
            <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name" name="name" required>
                <div id="nameError" class="error">Name is required</div>
            </div>
            <div class="form-group">
                <label for="village">Village Name</label>
                <input type="text" id="village" name="village" required>
                <div id="villageError" class="error">Village name is required</div>
            </div>
            <div class="form-group">
                <label for="complaint">Complaint</label>
                <textarea id="complaint" name="complaint" required></textarea>
                <div id="complaintError" class="error">Complaint is required</div>
            </div>
            <div class="form-group">
                <label>Upload Images (Max 2):</label>
                <div class="image-upload-container">
                    <input type="file" id="image1" name="image1" accept="image/*">
                    <input type="file" id="image2" name="image2" accept="image/*">
                </div>
                <small>Only JPG, JPEG, PNG formats are allowed.</small>
            </div>
            <button type="submit">Submit Complaint</button>
        </form>

        <div class="complaint-list" id="complaintsList">
            <h2>Submitted Complaints</h2>
            <?php
            // Database credentials
            $servername = "localhost";
            $username = "root";
            $password = "password";
            $dbname = "complaint_db";
            $table_name = "complaints";

            // Create database connection
            $conn = new mysqli($servername, $username, $password, $dbname);

            // Check connection
            if ($conn->connect_error) {
                echo "<p style='color: red;'>Error loading complaints: Could not connect to database.</p>";
            } else {
                $sql = "SELECT * FROM $table_name ORDER BY submission_time DESC";
                $result = $conn->query($sql);

                if ($result && $result->num_rows > 0) {
                    while ($row = $result->fetch_assoc()) {
                        echo "<div class='complaint-item'>";
                        echo "<div><strong>Name:</strong> " . htmlspecialchars($row['name']) . "</div>";
                        echo "<div><strong>Village:</strong> " . htmlspecialchars($row['village']) . "</div>";
                        echo "<div><strong>Complaint:</strong> " . htmlspecialchars($row['complaint']) . "</div>";
                        $submission_time = new DateTime($row['submission_time']);
                        echo "<div><strong>Submitted:</strong> " . $submission_time->format('Y-m-d H:i:s') . "</div>";

                        $images_html = '';
                        if (!empty($row['image1_path'])) {
                            $images_html .= "<img src='" . htmlspecialchars($row['image1_path']) . "' alt='Image 1'>";
                        }
                        if (!empty($row['image2_path'])) {
                            $images_html .= "<img src='" . htmlspecialchars($row['image2_path']) . "' alt='Image 2'>";
                        }
                        if (!empty($images_html)) {
                            echo "<div class='complaint-images'>" . $images_html . "</div>";
                        }

                        echo "</div>";
                    }
                    $result->free();
                } else {
                    echo "<p>No complaints submitted yet.</p>";
                }
                $conn->close();
            }
            ?>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const complaintForm = document.getElementById('complaintForm');
            const complaintsList = document.getElementById('complaintsList');
            const imageInputs = complaintForm.querySelectorAll('input[type="file"]');

            const nameError = document.getElementById('nameError');
            const villageError = document.getElementById('villageError');
            const complaintError = document.getElementById('complaintError');

            function displayNewComplaint(complaint) {
                const complaintItem = document.createElement('div');
                complaintItem.classList.add('complaint-item');

                let imagesHTML = '';
                if (complaint.image1_path) {
                    imagesHTML += `<img src="${complaint.image1_path}" alt="Complaint Image 1">`;
                }
                if (complaint.image2_path) {
                    imagesHTML += `<img src="${complaint.image2_path}" alt="Complaint Image 2">`;
                }
                if (imagesHTML) {
                    imagesHTML = `<div class="complaint-images">${imagesHTML}</div>`;
                }

                const submissionDate = new Date(complaint.submission_time);
                const formattedTime = submissionDate.getFullYear() + '-' +
                                     ('0' + (submissionDate.getMonth()+1)).slice(-2) + '-' +
                                     ('0' + submissionDate.getDate()).slice(-2) + ' ' +
                                     ('0' + submissionDate.getHours()).slice(-2) + ':' +
                                     ('0' + submissionDate.getMinutes()).slice(-2) + ':' +
                                     ('0' + submissionDate.getSeconds()).slice(-2);

                complaintItem.innerHTML = `
                    <div><strong>Name:</strong> ${complaint.name}</div>
                    <div><strong>Village:</strong> ${complaint.village ? complaint.village : 'N/A'}</div>
                    <div><strong>Complaint:</strong> ${complaint.complaint}</div>
                    <div><strong>Submitted:</strong> ${formattedTime}</div>
                    ${imagesHTML}
                `;

                const firstComplaintItem = complaintsList.querySelector('.complaint-item');
                if (firstComplaintItem) {
                    complaintsList.insertBefore(complaintItem, firstComplaintItem);
                } else {
                    complaintsList.appendChild(complaintItem);
                    const noComplaintsMessage = complaintsList.querySelector('p');
                    if (noComplaintsMessage && noComplaintsMessage.textContent.includes('No complaints submitted yet.')) {
                        noComplaintsMessage.remove();
                    }
                }
            }

            imageInputs.forEach(input => {
                input.addEventListener('change', function() {
                    let files = 0;
                    imageInputs.forEach(imgInput => {
                        if (imgInput.files.length > 0) {
                            files++;
                        }
                    });
                    if (files > 2) {
                        alert('You can upload a maximum of 2 images.');
                        this.value = '';
                    }
                });
            });

            complaintForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                let isValid = true;
                nameError.style.display = 'none';
                villageError.style.display = 'none';
                complaintError.style.display = 'none';

                if (!document.getElementById('name').value.trim()) {
                    nameError.style.display = 'block';
                    isValid = false;
                }
                if (!document.getElementById('village').value.trim()) {
                    villageError.style.display = 'block';
                    isValid = false;
                }
                if (!document.getElementById('complaint').value.trim()) {
                    complaintError.style.display = 'block';
                    isValid = false;
                }
                if (!isValid) {
                    return;
                }

                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
                for (const input of imageInputs) {
                    if (input.files.length > 0) {
                        if (!allowedTypes.includes(input.files[0].type)) {
                            alert('Please upload valid JPG, JPEG, or PNG images.');
                            return;
                        }
                    }
                }

                const formData = new FormData(complaintForm);
                try {
                    const response = await fetch('complain.php', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (data.success) {
                        alert('Complaint submitted successfully!');
                        complaintForm.reset();
                        if (data.new_complaint) {
                            displayNewComplaint(data.new_complaint);
                        }
                    } else {
                        alert('Error submitting complaint: ' + data.message);
                    }
                } catch (error) {
                    console.error('Error submitting form:', error);
                    alert('An error occurred during form submission.');
                }
            });
        });
    </script>
</body>
</html>