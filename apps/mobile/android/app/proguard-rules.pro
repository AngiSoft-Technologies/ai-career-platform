# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Flutter generated code
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Google Sign-In
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }

# Play Core (deferred components)
#
# The Flutter embedding ships Play Store split-install classes that reference
# com.google.android.play.core.*. This app does not use deferred components --
# the manifest uses android.app.Application and no plugin loads a split -- so
# those classes are never loaded. The blanket io.flutter.** keep rule above
# still makes R8 retain them, and R8 then fails the build on the absent Play
# Core types. Suppress the warnings rather than shipping the Play Core library
# for a feature this app does not have.
-dontwarn com.google.android.play.core.**

# SQFlite
-keep class com.tekartik.sqflite.** { *; }

# Connectivity Plus
-keep class dev.fluttercommunity.plus.connectivity.** { *; }
