#!/bin/bash

# Test script for the AI Coding Assistant upload functionality
# This script demonstrates how to upload a ZIP file to the worker

echo "🚀 Testing AI Coding Assistant Upload Functionality"
echo "=================================================="

# Check if the ZIP file exists
if [ ! -f "sample-project.zip" ]; then
    echo "❌ Error: sample-project.zip not found"
    echo "Please run this script from the test-data directory"
    exit 1
fi

echo "📁 ZIP file found: sample-project.zip"
echo "📊 File size: $(du -h sample-project.zip | cut -f1)"

# Default worker URL (change this to your deployed worker URL)
WORKER_URL="${WORKER_URL:-http://localhost:8787}"

echo "🌐 Worker URL: $WORKER_URL"
echo ""

echo "📤 Uploading ZIP file..."
echo "========================"

# Upload the ZIP file using curl
response=$(curl -s -X POST "$WORKER_URL/api/project/upload" \
    -F "codeZipFile=@sample-project.zip" \
    -w "\nHTTP_STATUS:%{http_code}")

# Extract HTTP status code
http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
json_response=$(echo "$response" | sed '/HTTP_STATUS:/d')

echo "📋 Response Status: $http_status"
echo "📄 Response Body:"
echo "$json_response" | jq . 2>/dev/null || echo "$json_response"

if [ "$http_status" = "200" ]; then
    echo ""
    echo "✅ Upload successful!"
    
    # Extract project ID if available
    project_id=$(echo "$json_response" | jq -r '.project_id' 2>/dev/null)
    if [ "$project_id" != "null" ] && [ "$project_id" != "" ]; then
        echo "🆔 Project ID: $project_id"
        echo "📂 Files will be stored in R2 under: projects/$project_id/original/"
    fi
else
    echo ""
    echo "❌ Upload failed with status: $http_status"
fi

echo ""
echo "🔍 To test this endpoint:"
echo "1. Start the worker: cd ../workers && npm run dev"
echo "2. Run this script: ./test-upload.sh"
echo "3. Or use a custom URL: WORKER_URL=https://your-worker.domain.workers.dev ./test-upload.sh" 