package app.dropspend.tracker

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern

class DropSpendNotificationService : NotificationListenerService() {

    companion object {
        // Configurable whitelist of allowed utility applications (e.g. Internet Speed Tracker).
        // Personal SMS, MMS, and chat messaging packages are strictly excluded.
        val ALLOWED_UTILITY_PACKAGES = setOf(
            "com.internet.speed.meter.lite",
            "com.internetspeed.meter.lite",
            "com.speed.internet.speedmeter",
            "com.example.utilityapp",
            "com.whatsapp",
            "com.instagram.android",
            "com.instagram.lite"
        )

        // Debit / Payment / Utility alert patterns
        private val DEBIT_PATTERNS = listOf(
            Pattern.compile("""(?:paid|debited|sent|spent|used|usage)\s+(?:rs\.?|inr|₹|mb|gb)?\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(?:to|at|for)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE),
            Pattern.compile("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:debited|spent|paid)(?:\s+(?:to|at|for)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE),
            Pattern.compile("""(?:txn of|transaction of)\s+(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(?:at|to)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE)
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        // Gate 1: Check master code-level feature flag
        if (!MainActivity.FEATURE_REMOTE_NOTIF_SYNC) return

        // Gate 2: Check explicit user approval in settings (default: false)
        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val isUserApproved = prefs.getBoolean(MainActivity.KEY_REMOTE_NOTIF_SYNC_ENABLED, false)
        if (!isUserApproved) return

        val pkg = sbn.packageName ?: ""

        // Gate 3: App Whitelist (Only configured utility apps; SMS/MMS strictly excluded)
        if (!ALLOWED_UTILITY_PACKAGES.contains(pkg)) {
            return
        }

        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val fullContent = "$title $text".trim()

        if (fullContent.isEmpty()) return

        // Skip non-transaction / auth messages like OTPs or requests
        val lower = fullContent.lowercase()
        if (lower.contains("otp") ||
            lower.contains("one time password") ||
            lower.contains("requested money")
        ) {
            return
        }

        for (pattern in DEBIT_PATTERNS) {
            val matcher = pattern.matcher(fullContent)
            if (matcher.find()) {
                val amountStr = matcher.group(1)?.replace(",", "") ?: continue
                val amount = amountStr.toDoubleOrNull() ?: continue
                if (amount <= 0) continue

                val rawMerchant = if (matcher.groupCount() >= 2) matcher.group(2) else null
                val merchant = rawMerchant?.trim()?.take(32) ?: (if (title.isNotEmpty()) title.take(32) else "Payment")

                bufferNotification(
                    packageName = pkg,
                    amount = amount,
                    merchant = merchant,
                    fullText = fullContent
                )

                // Also enqueue into immediate in-app pending adds so local app shows it right away
                val rawCommand = "${amount.toInt()} $merchant upi"
                DropSpendWidgetProvider.enqueueQuickAdd(applicationContext, rawCommand, amount.toInt())
                break
            }
        }
    }

    private fun bufferNotification(
        packageName: String,
        amount: Double,
        merchant: String,
        fullText: String
    ) {
        val prefs = getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(NotificationSyncWorker.KEY_BUFFERED_NOTIFS, "[]") ?: "[]"
        val arr = try {
            JSONArray(raw)
        } catch (_: Exception) {
            JSONArray()
        }

        val item = JSONObject().apply {
            put("id", "notif_${System.currentTimeMillis()}_${(100..999).random()}")
            put("timestamp", System.currentTimeMillis())
            put("sourceApp", packageName)
            put("amount", amount)
            put("merchant", merchant)
            put("rawText", fullText)
        }

        arr.put(item)
        prefs.edit().putString(NotificationSyncWorker.KEY_BUFFERED_NOTIFS, arr.toString()).apply()
    }
}
