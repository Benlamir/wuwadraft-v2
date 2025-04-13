# deploy_defaultHandler.ps1

Write-Host "Deploying defaultHandler function..."

# 1. Define variables (makes it easier to adapt)
$FunctionDir = ".\defaultHandler" # Relative path to the function code
$ZipFileName = "..\defaultHandler_deployment_package.zip" # Relative path for the zip file
$FunctionName = "wuwaDraftDefaultHandler"
# Optional: Add your AWS Region if needed
# $AWSRegion = "us-east-1"

Write-Host "Navigating to $FunctionDir..."
Push-Location $FunctionDir # Temporarily change directory

# --- Activate Virtual Env (Important!) ---
# Assuming venv is one level up (in backend/)
Write-Host "Activating virtual environment..."
# Note: Activating within a script can sometimes be tricky with scope.
# It might be better to ensure venv is active *before* running the script.
# If running manually, ensure venv is active first. If automating, consider other approaches.
# For simplicity here, assuming venv is active *before* running this script.

Write-Host "Installing dependencies into function directory..."
python -m pip install -r requirements.txt -t .

Write-Host "Creating deployment package: $ZipFileName ..."
Compress-Archive -Path * -DestinationPath $ZipFileName -Force

Write-Host "Deploying to AWS Lambda function: $FunctionName ..."
# Add --region $AWSRegion if needed
aws lambda update-function-code --function-name $FunctionName --zip-file "fileb://$ZipFileName"

Write-Host "Deployment script finished."

Pop-Location # Return to original directory
# Remember to deactivate manually after script if needed: deactivate