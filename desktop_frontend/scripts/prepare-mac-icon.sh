#!/bin/bash

# Script to generate an .icns file for macOS from a logo.png
# Requires: sips, iconutil (available on macOS by default)

set -e

# Navigate to desktop_frontend directory
cd "$(dirname "$0")/.."

SOURCE_IMG="build/logo.png"
OUTPUT_ICNS="build/icon.icns"
ICONSET_DIR="build/icon.iconset"

if [ -f "$OUTPUT_ICNS" ]; then
    echo "$OUTPUT_ICNS already exists. Skipping."
    exit 0
fi

if [ ! -f "$SOURCE_IMG" ]; then
    echo "Error: $SOURCE_IMG does not exist."
    exit 1
fi

echo "Generating $OUTPUT_ICNS from $SOURCE_IMG..."

mkdir -p "$ICONSET_DIR"

# Generate different sizes required for .icns
sips -z 16 16     "$SOURCE_IMG" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$SOURCE_IMG" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_IMG" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$SOURCE_IMG" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_IMG" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$SOURCE_IMG" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_IMG" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$SOURCE_IMG" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_IMG" --out "$ICONSET_DIR/icon_512x512.png"
sips -z 1024 1024 "$SOURCE_IMG" --out "$ICONSET_DIR/icon_512x512@2x.png"

# Convert the iconset to icns
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

# Clean up
rm -rf "$ICONSET_DIR"

echo "Successfully generated $OUTPUT_ICNS."
