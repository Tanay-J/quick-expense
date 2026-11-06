package app.dropspend.tracker

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * 0ms Native Floating Quick-Add Overlay Activity
 * Launched when tapping "+ Add" on the Home Screen Widget or the App Icon long-press shortcut.
 */
class QuickAddActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.setGravity(Gravity.BOTTOM)
        window.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE or
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )

        val dp = { value: Int ->
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value.toFloat(),
                resources.displayMetrics
            ).toInt()
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(14), dp(18), dp(18))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0F172A"))
                cornerRadii = floatArrayOf(
                    dp(24).toFloat(), dp(24).toFloat(),
                    dp(24).toFloat(), dp(24).toFloat(),
                    0f, 0f, 0f, 0f
                )
                setStroke(dp(1), Color.parseColor("#334155"))
            }
        }

        val header = TextView(this).apply {
            text = "⚡ DropSpend Quick Add"
            setTextColor(Color.parseColor("#F8FAFC"))
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
        }
        card.addView(header)

        val subHeader = TextView(this).apply {
            text = "Type naturally (e.g. 200 fuel bike upi) or tap a usual below"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 12f
            setPadding(0, dp(2), 0, dp(10))
        }
        card.addView(subHeader)

        // Input Row
        val inputRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val editText = EditText(this).apply {
            hint = "200 snacks upi"
            setHintTextColor(Color.parseColor("#64748B"))
            setTextColor(Color.WHITE)
            textSize = 16f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_DONE
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1E293B"))
                cornerRadius = dp(12).toFloat()
                setStroke(dp(1), Color.parseColor("#3B82F6"))
            }
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = dp(8)
            }
        }

        val submitBtn = Button(this).apply {
            text = "Add ↵"
            isAllCaps = false
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#2563EB"))
                cornerRadius = dp(12).toFloat()
            }
            layoutParams = LinearLayout.LayoutParams(dp(82), dp(46))
        }

        fun submitExpense(rawText: String) {
            val cleaned = rawText.trim()
            if (cleaned.isEmpty()) return
            editText.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            DropSpendWidgetProvider.enqueueQuickAdd(this, cleaned)
            Toast.makeText(this, "✓ Saved \"$cleaned\"", Toast.LENGTH_SHORT).show()
            finish()
        }

        submitBtn.setOnClickListener { submitExpense(editText.text.toString()) }
        editText.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_SEND) {
                submitExpense(editText.text.toString())
                true
            } else {
                false
            }
        }

        inputRow.addView(editText)
        inputRow.addView(submitBtn)
        card.addView(inputRow)

        // Optional Usuals quick-tap row from saved widget snapshot
        try {
            val prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE)
            val snapRaw = prefs.getString(MainActivity.KEY_WIDGET_JSON, null)
            if (!snapRaw.isNullOrEmpty()) {
                val obj = JSONObject(snapRaw)
                val usuals = obj.optJSONArray("usuals")
                if (usuals != null && usuals.length() > 0) {
                    val usualsRow = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        setPadding(0, dp(10), 0, 0)
                    }
                    val count = minOf(3, usuals.length())
                    for (i in 0 until count) {
                        val u = usuals.getJSONObject(i)
                        val icon = u.optString("icon", "⚡")
                        val note = u.optString("note", "Item")
                        val amt = u.optInt("amount", 0)
                        val rawCmd = u.optString("rawCommand", "$amt $note upi")

                        val chip = Button(this).apply {
                            text = "$icon $note ₹$amt"
                            isAllCaps = false
                            setTextColor(Color.parseColor("#E2E8F0"))
                            textSize = 11f
                            setPadding(dp(8), dp(6), dp(8), dp(6))
                            background = GradientDrawable().apply {
                                setColor(Color.parseColor("#1E293B"))
                                cornerRadius = dp(10).toFloat()
                                setStroke(dp(1), Color.parseColor("#334155"))
                            }
                            layoutParams = LinearLayout.LayoutParams(
                                0,
                                dp(36),
                                1f
                            ).apply {
                                if (i < count - 1) marginEnd = dp(6)
                            }
                            setOnClickListener { submitExpense(rawCmd) }
                        }
                        usualsRow.addView(chip)
                    }
                    card.addView(usualsRow)
                }
            }
        } catch (_: Exception) {
        }

        setContentView(card)
        editText.requestFocus()
    }
}
