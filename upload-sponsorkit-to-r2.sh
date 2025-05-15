#!/bin/bash

BUCKET_NAME="sponsors"
SOURCE_DIR="./sponsorkit"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Directory $SOURCE_DIR does not exist. Run sponsorkit first."
  exit 1
fi

echo "Starting upload of $SOURCE_DIR to R2 bucket: $BUCKET_NAME"

find "$SOURCE_DIR" -type f | while read -r file; do
  key="${file#$SOURCE_DIR/}"
  echo "Uploading $file to r2://$BUCKET_NAME/$key ..."
  npx wrangler r2 object put "$BUCKET_NAME/$key" --file="$file" --remote
done

echo "All files uploaded to R2 bucket: $BUCKET_NAME"