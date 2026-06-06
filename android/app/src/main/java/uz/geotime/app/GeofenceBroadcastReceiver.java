package uz.geotime.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import java.util.ArrayList;
import java.util.List;

/**
 * Receives ENTER/EXIT transitions from the OS geofencing service. Fires even
 * when the app process is dead. We:
 *   1. Re-emit the transition to JS if the plugin instance is alive.
 *   2. Post a notification so the worker is nudged to open the app (which
 *      lets the JS layer create/close the shift).
 */
public class GeofenceBroadcastReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "geotime_geofence";
    private static final int NOTIFICATION_ID = 4711;

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;

        String transition;
        int t = event.getGeofenceTransition();
        if (t == Geofence.GEOFENCE_TRANSITION_ENTER) transition = "enter";
        else if (t == Geofence.GEOFENCE_TRANSITION_EXIT) transition = "exit";
        else return;

        List<String> ids = new ArrayList<>();
        List<Geofence> triggering = event.getTriggeringGeofences();
        if (triggering != null) {
            for (Geofence g : triggering) ids.add(g.getRequestId());
        }

        // 1. Emit to JS if alive.
        if (GeofencePlugin.instance != null) {
            GeofencePlugin.instance.emitTransition(ids, transition);
        }

        // 2. Notify the worker.
        boolean enter = "enter".equals(transition);
        postNotification(context,
                enter ? "Вы пришли на объект" : "Вы покинули объект",
                enter
                        ? "GeoTime отметит начало смены. Откройте приложение для подтверждения."
                        : "GeoTime приостановит смену. Вернитесь в зону, чтобы продолжить.");
    }

    private void postNotification(Context context, String title, String body) {
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Геозоны смен", NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(channel);
        }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pending = null;
        if (launch != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
            pending = PendingIntent.getActivity(context, 0, launch, flags);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);
        if (pending != null) builder.setContentIntent(pending);
        manager.notify(NOTIFICATION_ID, builder.build());
    }
}
