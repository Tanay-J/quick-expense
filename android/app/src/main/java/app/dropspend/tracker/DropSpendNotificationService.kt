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
        // Broad payment, banking, and UPI packages
        private val PAYMENT_PACKAGES = setOf(
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",                        // PhonePe
            "net.one97.paytm",                        // Paytm
            "in.org.npci.upiapp",                     // BHIM
            "com.dreamplug.androidapp",               // CRED
            "com.axis.mobile",                        // Axis Mobile
            "com.hdfcbank.payzapp",                   // PayZapp
            "com.snapwork.hdfc",                      // HDFC Bank MobileBanking
            "com.csam.icici.bank.imobile",            // iMobile Pay
            "com.sbi.lotusintouch"                    // YONO SBI
        )

        // Debit / Payment patterns across Indian UPI, Cards, and Net Banking
        private val DEBIT_PATTERNS = listOf(
            Pattern.compile("""(?:paid|debited|sent|spent)\s+(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(?:to|at|for)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE),
            Pattern.compile("""(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:debited|spent|paid)(?:\s+(?:to|at|for)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE),
            Pattern.compile("""(?:txn of|transaction of)\s+(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s+(?:at|to)\s+([a-zA-Z0-9\s&'.-]+))?""", Pattern.CASE_INSENSITIVE)
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val pkg = sbn.packageName ?: ""
        val extras = sbn.notification?.extras ?: return
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val fullContent = "$title $text".trim()

        if (fullContent.isEmpty()) return

        // Skip non-debit messages like OTPs, credits, promos, or requests
        val lower = fullContent.lowercase()
        if (lower.contains("otp") ||
            lower.contains("one time password") ||
            lower.contains("credited to") ||
            lower.contains("received from") ||
            lower.contains("requested money")
        ) {
            return
        }

        // Only parse if from known payment apps OR contains clear payment tokens
        val isPaymentApp = PAYMENT_PACKAGES.contains(pkg) || pkg.contains("sms") || pkg.contains("mms") || pkg.contains("messaging")
        val hasDebitKeyword = lower.contains("paid") || lower.contains("debited") || lower.contains("spent") || lower.contains("vpa") || lower.contains("upi")

        if (!isPaymentApp && !hasDebitKeyword) {
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
