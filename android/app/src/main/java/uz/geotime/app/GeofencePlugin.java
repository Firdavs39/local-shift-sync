package uz.geotime.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Native circular geofencing using the Android Geofencing API.
 *
 * The OS itself monitors the registered regions — even when the app is killed —
 * and fires GeofenceBroadcastReceiver on ENTER/EXIT. The receiver re-emits the
 * transition to JS via this plugin's `geofenceTransition` event (when the app
 * is alive) and posts a notification (so the worker is nudged to open the app
 * when it isn't).
 *
 * Registered as an app-embedded plugin in MainActivity.registerPlugin().
 * Written in Java so it compiles in the default Capacitor Java toolchain
 * (no Kotlin Gradle plugin required).
 */
@CapacitorPlugin(name = "Geofence")
public class GeofencePlugin extends Plugin {

    static GeofencePlugin instance;

    private GeofencingClient geofencingClient;
    private PendingIntent geofencePendingIntent;

    @Override
    public void load() {
        instance = this;
        geofencingClient = LocationServices.getGeofencingClient(getContext());
    }

    private PendingIntent getPendingIntent() {
        if (geofencePendingIntent != null) return geofencePendingIntent;
        Intent intent = new Intent(getContext(), GeofenceBroadcastReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        geofencePendingIntent = PendingIntent.getBroadcast(getContext(), 0, intent, flags);
        return geofencePendingIntent;
    }

    /** addGeofences({ geofences: [{ id, latitude, longitude, radius }] }) */
    @PluginMethod
    public void addGeofences(PluginCall call) {
        JSArray arr = call.getArray("geofences");
        if (arr == null) {
            call.reject("geofences array required");
            return;
        }
        List<Geofence> list = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String id = obj.optString("id");
                double lat = obj.optDouble("latitude", Double.NaN);
                double lon = obj.optDouble("longitude", Double.NaN);
                float radius = (float) obj.optDouble("radius", 150.0);
                if (id == null || id.isEmpty() || Double.isNaN(lat) || Double.isNaN(lon)) continue;
                list.add(new Geofence.Builder()
                        .setRequestId(id)
                        .setCircularRegion(lat, lon, radius)
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(
                                Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
                        .setNotificationResponsiveness(60_000) // up to 60s to save battery
                        .build());
            }
        } catch (JSONException e) {
            call.reject("invalid geofences: " + e.getMessage());
            return;
        }
        if (list.isEmpty()) {
            call.reject("no valid geofences");
            return;
        }

        GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(list)
                .build();

        try {
            geofencingClient.addGeofences(request, getPendingIntent())
                    .addOnSuccessListener(unused -> call.resolve())
                    .addOnFailureListener(e -> call.reject("addGeofences failed: " + e.getMessage()));
        } catch (SecurityException e) {
            call.reject("location permission missing: " + e.getMessage());
        }
    }

    /** removeAllGeofences() */
    @PluginMethod
    public void removeAllGeofences(PluginCall call) {
        geofencingClient.removeGeofences(getPendingIntent())
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> call.reject("removeGeofences failed: " + e.getMessage()));
    }

    /** Emit a transition event to JS (called from the broadcast receiver). */
    void emitTransition(List<String> ids, String transition) {
        JSObject data = new JSObject();
        data.put("transition", transition); // "enter" | "exit"
        JSArray arr = new JSArray();
        for (String id : ids) arr.put(id);
        data.put("ids", arr);
        notifyListeners("geofenceTransition", data);
    }
}
