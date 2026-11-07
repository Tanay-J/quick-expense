package app.dropspend.tracker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class NotificationSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        const val HARDCODED_WEBHOOK_URL =
            "https://script.google.com/macros/s/AKfycbwWUN6LyBsdzRI-_p5f3aVhEQaZqIrvoGatXDbtLdFjzIl4wlmnX7f960fBC-3Kv1k/exec"
        const val KEY_BUFFERED_NOTIFS = "buffered_notifications_v1"
    }

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_BUFFERED_NOTIFS, "[]") ?: "[]"
        val items = try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }

        if (items.length() == 0) {
            return Result.success()
        }

        val payload = JSONObject().apply {
            put("action", "append_notifications")
            put("items", items)
        }

        return try {
            val conn = (URL(HARDCODED_WEBHOOK_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 15000
                readTimeout = 15000
            }

            OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }

            if (conn.responseCode in 200..299) {
                // Clear the buffered records upon successful upload
                prefs.edit().putString(KEY_BUFFERED_NOTIFS, "[]").apply()
                Result.success()
            } else {
                Result.retry()
            }
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
