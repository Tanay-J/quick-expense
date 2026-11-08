package app.dropspend.tracker

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.HapticFeedbackConstants
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val ioExecutor = Executors.newSingleThreadExecutor()
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

    companion object {
        // Master code-level feature flag: Set to false to completely remove/disable this feature
        const val FEATURE_REMOTE_NOTIF_SYNC = true
        const val KEY_REMOTE_NOTIF_SYNC_ENABLED = "remote_notif_sync_enabled"

        const val PREFS_NAME = "dropspend_native_prefs"
        const val KEY_WIDGET_JSON = "widget_snapshot_json"
        const val KEY_PENDING_ADDS = "pending_quick_adds_json"
        private const val FILE_CHOOSER_REQ = 1001

        private val OTA_FILES = listOf(
            "index.html",
            "styles.css",
            "app.js",
            "spec-ui.js",
            "native-bridge.js",
            "parser.js",
            "insights.js",
            "sync.js",
            "manifest.json"
        )
        private const val GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Tanay-J/quick-expense/main/"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#F6F5F2"))
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = false
                allowContentAccess = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                textZoom = 100
                userAgentString = "$userAgentString DropSpendAndroid/1.9"
            }
        }
        setContentView(webView)

        val otaDir = File(filesDir, "ota_public")
        val bundledAssetsHandler = WebViewAssetLoader.AssetsPathHandler(this)

        // Serve OTA-updated files from filesDir/ota_public first; fall back to bundled APK assets/public
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/public/") { path ->
                val cleanPath = path.substringBefore("?").trimStart('/')
                val otaFile = File(otaDir, cleanPath)
                if (otaFile.exists() && otaFile.isFile && otaFile.length() > 0) {
                    val mime = guessMimeType(cleanPath)
                    WebResourceResponse(mime, "UTF-8", FileInputStream(otaFile))
                } else {
                    bundledAssetsHandler.handle("public/$cleanPath")
                }
            }
            .build()

        webView.addJavascriptInterface(DropSpendJsBridge(), "DropSpendNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webView.postDelayed({
                    webView.requestFocus()
                    val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                    imm?.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
                }, 120)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("https://appassets.androidplatform.net")) {
                    return false
                }
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    true
                } catch (_: Exception) {
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                    }
                    startActivityForResult(intent, FILE_CHOOSER_REQ)
                    true
                } catch (_: Exception) {
                    fileUploadCallback = null
                    false
                }
            }
        }

        val startQuery = buildStartQuery(intent)
        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html$startQuery")

        // Schedule periodic sync (4 times a day = every 6 hours)
        schedulePeriodicNotificationSync()

        // Pull any latest git push from GitHub main silently in background
        syncOtaFromGitHub(reloadOnChange = false)
    }

    private fun schedulePeriodicNotificationSync() {
        if (!FEATURE_REMOTE_NOTIF_SYNC) {
            try {
                androidx.work.WorkManager.getInstance(applicationContext).cancelUniqueWork("DropSpend4xDailySync")
            } catch (_: Exception) {}
            return
        }
        try {
            val constraints = androidx.work.Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                .build()

            // 6 hours interval = 4 times a day
            val workRequest = androidx.work.PeriodicWorkRequestBuilder<NotificationSyncWorker>(
                6, java.util.concurrent.TimeUnit.HOURS
            )
            .setConstraints(constraints)
            .build()

            androidx.work.WorkManager.getInstance(applicationContext).enqueueUniquePeriodicWork(
                "DropSpend4xDailySync",
                androidx.work.ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        } catch (_: Exception) {
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        val startScreen = intent?.getStringExtra("start_screen")
        val quickAdd = intent?.getBooleanExtra("open_quick_add", false) ?: false
        if (quickAdd) {
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('dropspend:open-add'));", null)
        } else if (startScreen == "stats") {
            webView.evaluateJavascript("window.location.search='?screen=stats';", null)
        }
    }

    override fun onResume() {
        super.onResume()
        // Notify JS bridge to drain any expenses added from the Home Screen Widget or Floating Quick-Add
        webView.evaluateJavascript(
            "document.dispatchEvent(new Event('visibilitychange'));",
            null
        )
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function(){ return window.onAndroidBackPressed ? Boolean(window.onAndroidBackPressed()) : false; })()"
        ) { result ->
            if (result != "true") {
                super.onBackPressed()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQ) {
            val results = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            fileUploadCallback?.onReceiveValue(results)
            fileUploadCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    private fun buildStartQuery(intent: Intent?): String {
        val screen = intent?.getStringExtra("start_screen")
        val quickAdd = intent?.getBooleanExtra("open_quick_add", false) ?: false
        return when {
            quickAdd -> "?quickadd=1"
            screen == "stats" -> "?screen=stats"
            else -> ""
        }
    }

    private fun guessMimeType(path: String): String {
        return when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") -> "text/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".svg") -> "image/svg+xml"
            else -> "application/octet-stream"
        }
    }

    private fun syncOtaFromGitHub(reloadOnChange: Boolean) {
        ioExecutor.execute {
            try {
                val otaDir = File(filesDir, "ota_public")
                if (!otaDir.exists()) otaDir.mkdirs()
                var anyChanged = false

                for (fileName in OTA_FILES) {
                    val url = URL("$GITHUB_RAW_BASE$fileName?t=${System.currentTimeMillis()}")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 5000
                        readTimeout = 5000
                        requestMethod = "GET"
                    }
                    if (conn.responseCode == 200) {
                        val bytes = conn.inputStream.use { it.readBytes() }
                        if (bytes.isNotEmpty()) {
                            val target = File(otaDir, fileName)
                            val existing = if (target.exists()) target.readBytes() else ByteArray(0)
                            if (!existing.contentEquals(bytes)) {
                                val tmp = File(otaDir, "$fileName.tmp")
                                tmp.writeBytes(bytes)
                                tmp.renameTo(target)
                                anyChanged = true
                            }
                        }
                    }
                    conn.disconnect()
                }

                if (anyChanged && reloadOnChange) {
                    runOnUiThread { webView.reload() }
                }
            } catch (_: Exception) {
                // Offline or unreachable — keep running cached local assets seamlessly
            }
        }
    }

    inner class DropSpendJsBridge {

        @JavascriptInterface
        fun haptic(style: String) {
            runOnUiThread {
                val constant = when (style) {
                    "heavy", "warning" -> HapticFeedbackConstants.LONG_PRESS
                    "medium", "success" -> HapticFeedbackConstants.VIRTUAL_KEY
                    else -> HapticFeedbackConstants.KEYBOARD_TAP
                }
                webView.performHapticFeedback(
                    constant,
                    HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING
                )
            }
            try {
                val vib = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (vib != null && vib.hasVibrator()) {
                    val ms = when (style) {
                        "success" -> 16L
                        "heavy" -> 20L
                        "medium" -> 10L
                        else -> 5L
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vib.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        vib.vibrate(ms)
                    }
                }
            } catch (_: Exception) {
            }
        }

        @JavascriptInterface
        fun updateWidgetData(json: String) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_WIDGET_JSON, json)
                .apply()
            DropSpendWidgetProvider.refreshAllWidgets(this@MainActivity)
        }

        @JavascriptInterface
        fun drainPendingQuickAdds(): String {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val current = prefs.getString(KEY_PENDING_ADDS, "[]") ?: "[]"
            if (current != "[]") {
                prefs.edit().putString(KEY_PENDING_ADDS, "[]").apply()
            }
            return current
        }

        @JavascriptInterface
        fun triggerOtaSync() {
            syncOtaFromGitHub(reloadOnChange = true)
        }

        @JavascriptInterface
        fun openQuickAddSheet() {
            runOnUiThread {
                startActivity(Intent(this@MainActivity, QuickAddActivity::class.java))
            }
        }

        @JavascriptInterface
        fun showKeyboard() {
            runOnUiThread {
                webView.requestFocus()
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
                imm?.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
            }
        }

        @JavascriptInterface
        fun minimizeApp() {
            runOnUiThread {
                moveTaskToBack(true)
            }
        }

        @JavascriptInterface
        fun isNotificationListenerEnabled(): Boolean {
            return try {
                val flat = android.provider.Settings.Secure.getString(
                    contentResolver,
                    "enabled_notification_listeners"
                ) ?: return false
                flat.contains(packageName)
            } catch (e: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun openNotificationListenerSettings() {
            runOnUiThread {
                try {
                    val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                } catch (e: Exception) {
                    try {
                        val fallback = Intent(android.provider.Settings.ACTION_SETTINGS)
                        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(fallback)
                    } catch (_: Exception) {}
                }
            }
        }

        @JavascriptInterface
        fun isRemoteNotificationSyncFeatureActive(): Boolean {
            return FEATURE_REMOTE_NOTIF_SYNC
        }

        @JavascriptInterface
        fun isNotificationSyncEnabled(): Boolean {
            if (!FEATURE_REMOTE_NOTIF_SYNC) return false
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_REMOTE_NOTIF_SYNC_ENABLED, false)
        }

        @JavascriptInterface
        fun setNotificationSyncEnabled(enabled: Boolean) {
            if (!FEATURE_REMOTE_NOTIF_SYNC) return
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean(KEY_REMOTE_NOTIF_SYNC_ENABLED, enabled).apply()
            if (!enabled) {
                prefs.edit().putString(NotificationSyncWorker.KEY_BUFFERED_NOTIFS, "[]").apply()
            }
        }
    }
}
