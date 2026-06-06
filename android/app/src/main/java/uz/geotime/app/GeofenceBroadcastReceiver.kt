package uz.geotime.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

/**
 * Receives ENTER/EXIT transitions from the OS geofencing service. Fires even
 * when the app process is dead. We:
 *   1. Re-emit the transition to JS if the plugin instance is alive.
 *   2. Post a notification so the worker is nudged to open the app (which
 *      lets the JS layer create/close the shift).
 */
class GeofenceBroadcastReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return

        val transition = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            else -> return
        }

        val ids = event.triggeringGeofences?.mapNotNull { it.requestId } ?: emptyList()

        // 1. Emit to JS if alive.
        GeofencePlugin.instance?.emitTransition(ids, transition)

        // 2. Notify the worker.
        val title = if (transition == "enter") "Вы пришли на объект" else "Вы покинули объект"
        val body = if (transition == "enter")
            "GeoTime отметит начало смены. Откройте приложение для подтверждения."
        else
            "GeoTime приостановит смену. Вернитесь в зону, чтобы продолжить."
        postNotification(context, title, body)
    }

    private fun postNotification(context: Context, title: String, body: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Геозоны смен",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pending = launch?.let {
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            else
                android.app.PendingIntent.FLAG_UPDATE_CURRENT
            android.app.PendingIntent.getActivity(context, 0, it, flags)
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .apply { pending?.let { setContentIntent(it) } }
            .build()
        manager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        private const val CHANNEL_ID = "geotime_geofence"
        private const val NOTIFICATION_ID = 4711
    }
}
