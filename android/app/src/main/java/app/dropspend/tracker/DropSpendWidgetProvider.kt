package app.dropspend.tracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.widget.RemoteViews
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

class DropSpendWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_LOG_USUAL = "app.dropspend.tracker.ACTION_LOG_USUAL"
        const val ACTION_REFRESH_WIDGET = "app.dropspend.tracker.ACTION_REFRESH_WIDGET"
        const val EXTRA_USUAL_CMD = "extra_usual_cmd"
        const val EXTRA_USUAL_AMT = "extra_usual_amt"
        const val EXTRA_USUAL_LABEL = "extra_usual_label"

        fun refreshAllWidgets(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, DropSpendWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                val intent = Intent(context, DropSpendWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            }
        }

        fun enqueueQuickAdd(context: Context, rawCommand: String, knownAmount: Int = 0) {
            val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
            val existingRaw = prefs.getString(MainActivity.KEY_PENDING_ADDS, "[]") ?: "[]"
            val arr = try {
                JSONArray(existingRaw)
            } catch (_: Exception) {
                JSONArray()
            }
            arr.put(rawCommand)

            // Optimistically update widget snapshot totals so the Home Screen Widget reflects the new spend in 0ms
            val parsedAmt = if (knownAmount > 0) {
                knownAmount
            } else {
                Regex("""(\d+(?:\.\d+)?)""").find(rawCommand)?.groupValues?.get(1)?.toDoubleOrNull()?.toInt() ?: 0
            }

            val snapRaw = prefs.getString(MainActivity.KEY_WIDGET_JSON, null)
            val updatedSnap = try {
                val obj = if (!snapRaw.isNullOrEmpty()) JSONObject(snapRaw) else JSONObject()
                if (parsedAmt > 0) {
                    obj.put("monthTotal", obj.optInt("monthTotal", 0) + parsedAmt)
                    obj.put("todayTotal", obj.optInt("todayTotal", 0) + parsedAmt)
                    obj.put("leftAmt", maxOf(0, obj.optInt("leftAmt", 30000) - parsedAmt))
                }
                obj.toString()
            } catch (_: Exception) {
                snapRaw
            }

            prefs.edit().apply {
                putString(MainActivity.KEY_PENDING_ADDS, arr.toString())
                if (updatedSnap != null) putString(MainActivity.KEY_WIDGET_JSON, updatedSnap)
                apply()
            }

            refreshAllWidgets(context)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_LOG_USUAL) {
            val cmd = intent.getStringExtra(EXTRA_USUAL_CMD) ?: return
            val amt = intent.getIntExtra(EXTRA_USUAL_AMT, 0)
            val label = intent.getStringExtra(EXTRA_USUAL_LABEL) ?: cmd

            try {
                val vib = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (vib != null && vib.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vib.vibrate(VibrationEffect.createOneShot(14L, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        vib.vibrate(14L)
                    }
                }
            } catch (_: Exception) {
            }

            enqueueQuickAdd(context, cmd, amt)
            Toast.makeText(context, "✓ Logged $label", Toast.LENGTH_SHORT).show()
        } else if (intent.action == ACTION_REFRESH_WIDGET) {
            refreshAllWidgets(context)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, widgetId)
        }
    }

    private fun updateSingleWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        widgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_dropspend)
        val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val snapRaw = prefs.getString(MainActivity.KEY_WIDGET_JSON, null)
        val nf = NumberFormat.getNumberInstance(Locale("en", "IN"))

        var monthLabel = "THIS MONTH"
        var monthTotal = 0
        var todayTotal = 0
        var leftAmt = 30000
        var perDay = 1000
        var paceLabel = "Tap + Add to log"

        val defaultUsuals = listOf(
            Triple("☕ Coffee ₹150", "150 coffee upi", 150),
            Triple("⛽ Fuel ₹200", "200 fuel upi", 200),
            Triple("🛒 Snacks ₹100", "100 snacks upi", 100)
        )
        val usualButtons = defaultUsuals.toMutableList()

        if (!snapRaw.isNullOrEmpty()) {
            try {
                val obj = JSONObject(snapRaw)
                monthLabel = obj.optString("monthLabel", "THIS MONTH")
                monthTotal = obj.optInt("monthTotal", 0)
                todayTotal = obj.optInt("todayTotal", 0)
                leftAmt = obj.optInt("leftAmt", 30000)
                perDay = obj.optInt("perDayAllowance", 1000)
                paceLabel = obj.optString("paceLabel", "On pace")

                val arr = obj.optJSONArray("usuals")
                if (arr != null && arr.length() > 0) {
                    for (i in 0 until minOf(3, arr.length())) {
                        val u = arr.getJSONObject(i)
                        val icon = u.optString("icon", "⚡")
                        val note = u.optString("note", "Item")
                        val amt = u.optInt("amount", 100)
                        val cmd = u.optString("rawCommand", "$amt $note upi")
                        usualButtons[i] = Triple("$icon $note ₹$amt", cmd, amt)
                    }
                }
            } catch (_: Exception) {
            }
        }

        views.setTextViewText(R.id.widget_kicker, "₹ DROPSPEND · $monthLabel")
        views.setTextViewText(R.id.widget_month_total, "₹${nf.format(monthTotal)}")
        views.setTextViewText(R.id.widget_today_badge, "Today ₹${nf.format(todayTotal)}")
        views.setTextViewText(
            R.id.widget_pace_line,
            "₹${nf.format(leftAmt)} left (₹${nf.format(perDay)}/d) · $paceLabel"
        )

        val immutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        // Tap header area -> Open MainActivity
        val openMainIntent = Intent(context, MainActivity::class.java)
        val openMainPi = PendingIntent.getActivity(context, 100, openMainIntent, immutableFlag)
        views.setOnClickPendingIntent(R.id.widget_header_area, openMainPi)

        // Tap "+ Add" button -> Open 0ms Floating QuickAddActivity
        val quickAddIntent = Intent(context, QuickAddActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val quickAddPi = PendingIntent.getActivity(context, 101, quickAddIntent, immutableFlag)
        views.setOnClickPendingIntent(R.id.widget_quick_add_btn, quickAddPi)

        // Bind the 3 1-Tap Usual buttons
        val btnIds = listOf(R.id.widget_usual_1, R.id.widget_usual_2, R.id.widget_usual_3)
        for (i in 0..2) {
            val (label, cmd, amt) = usualButtons[i]
            views.setTextViewText(btnIds[i], label)
            val logIntent = Intent(context, DropSpendWidgetProvider::class.java).apply {
                action = ACTION_LOG_USUAL
                putExtra(EXTRA_USUAL_CMD, cmd)
                putExtra(EXTRA_USUAL_AMT, amt)
                putExtra(EXTRA_USUAL_LABEL, label)
            }
            val logPi = PendingIntent.getBroadcast(context, 200 + i, logIntent, immutableFlag)
            views.setOnClickPendingIntent(btnIds[i], logPi)
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
