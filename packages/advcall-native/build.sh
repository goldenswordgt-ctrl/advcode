#!/bin/bash
# build.sh — Build advcall native browser
# Usage: ./build.sh [run|build|clean]

set -e

APP_NAME="AdvCall"
BUILD_DIR="build"
SRC_DIR="Sources/AdvCall"
RESOURCES_DIR="Resources"

echo "🗡️  Building advcall (native WebKit)..."
echo ""

# Clean
if [ "$1" = "clean" ]; then
    echo "Cleaning build directory..."
    rm -rf "$BUILD_DIR"
    echo "✅ Clean."
    exit 0
fi

# Create build directory
mkdir -p "$BUILD_DIR"

# Compile all Swift files
echo "⚙️  Compiling Swift sources..."
swiftc \
    -o "$BUILD_DIR/$APP_NAME" \
    "$SRC_DIR/main.swift" \
    "$SRC_DIR/AppDelegate.swift" \
    "$SRC_DIR/BrowserViewController.swift" \
    "$SRC_DIR/TabBarView.swift" \
    "$SRC_DIR/NavigationBarView.swift" \
    "$SRC_DIR/StatusBarView.swift" \
    -framework Cocoa \
    -framework WebKit \
    -target arm64-apple-macosx13.0 \
    -O \
    -whole-module-optimization

echo "✅ Compiled: $BUILD_DIR/$APP_NAME"

# Create .app bundle
echo "📦 Creating app bundle..."
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$BUILD_DIR/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
cp "$RESOURCES_DIR/Info.plist" "$APP_BUNDLE/Contents/Info.plist"

# Copy icon if it exists
if [ -f "$RESOURCES_DIR/AppIcon.icns" ]; then
    cp "$RESOURCES_DIR/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
    echo "✅ Icon installed."
elif [ -f "$RESOURCES_DIR/AppIcon.png" ]; then
    # Convert PNG to icns
    echo "⚠️  No .icns found, using .png directly (for dev only)"
    cp "$RESOURCES_DIR/AppIcon.png" "$APP_BUNDLE/Contents/Resources/AppIcon.png"
fi

# Copy entitlements for code signing (ad-hoc)
if [ -f "$RESOURCES_DIR/AdvCall.entitlements" ]; then
    codesign --force --sign - --entitlements "$RESOURCES_DIR/AdvCall.entitlements" "$APP_BUNDLE" 2>/dev/null || true
    echo "✅ Ad-hoc signed with entitlements."
fi

echo ""
echo "🔨 Build complete!"
echo "   App: $APP_BUNDLE"
echo ""

# Run if requested
if [ "$1" = "run" ]; then
    echo "🚀 Launching advcall..."
    open "$APP_BUNDLE"
fi
