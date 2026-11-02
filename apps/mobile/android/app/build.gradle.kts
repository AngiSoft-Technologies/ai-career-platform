import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "ke.co.angisoft.mboqara"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_25
        targetCompatibility = JavaVersion.VERSION_25
    }

    defaultConfig {
        applicationId = "ke.co.angisoft.mboqara"
        minSdk = 26
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            // The release key lives in `android/`, next to this module, so the
            // properties file and the `storeFile` path recorded inside it are
            // both relative to `android/app/`.
            val keyPropsFile = listOf(file("../key.properties"), file("key.properties"))
                .firstOrNull { it.isFile() }
            if (keyPropsFile != null) {
                val keyProps = Properties()
                keyProps.load(keyPropsFile.inputStream())
                storeFile = file(keyProps["storeFile"] as String)
                storePassword = keyProps["storePassword"] as String
                keyAlias = keyProps["keyAlias"] as String
                keyPassword = keyProps["keyPassword"] as String
            } else {
                // No release key on this machine. Fall back to the standard
                // Android debug keystore so a release build still produces an
                // installable bundle -- it is not uploadable to Play.
                val debugKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
                if (!debugKeystore.isFile) {
                    throw GradleException(
                        "No release signing key found. Add apps/mobile/android/key.properties " +
                            "and its .keystore, or create the Android debug keystore at $debugKeystore."
                    )
                }
                storeFile = debugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_25
    }
}

flutter {
    source = "../.."
}