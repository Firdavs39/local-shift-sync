package uz.geotime.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices

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
 */
@CapacitorPlugin(name = "Geofence")
class GeofencePlugin : Plugin() {

    private val geofencingClient: GeofencingClient by lazy {
        LocationServices.getGeofencingClient(context)
    }

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    override fun load() {
        // Let the receiver reach back into this plugin instance to emit JS events.
        instance = this
    }

    /** addGeofences({ geofences: [{ id, latitude, longitude, radius }] }) */
    @PluginMethod
    fun addGeofences(call: PluginCall) {
        val arr: JSArray = call.getArray("geofences") ?: run {
            call.reject("geofences array required")
            return
        }
        val list = ArrayList<Geofence>()
        for (i in 0 until arr.length()) {
            val obj = arr.getJSONObject(i)
            val id = obj.optString("id")
            val lat = obj.optDouble("latitude")
            val lon = obj.optDouble("longitude")
            val radius = obj.optDouble("radius", 150.0).toFloat()
            if (id.isNullOrEmpty() || lat.isNaN() || lon.isNaN()) continue
            list.add(
                Geofence.Builder()
                    .setRequestId(id)
                    .setCircularRegion(lat, lon, radius)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(
                        Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT
                    )
                    .setNotificationResponsiveness(60_000) // up to 60s to save battery
                    .build()
            )
        }
        if (list.isEmpty()) {
            call.reject("no valid geofences")
            return
        }

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(list)
            .build()

        try {
            geofencingClient.addGeofences(request, geofencePendingIntent)
                .addOnSuccessListener { call.resolve() }
                .addOnFailureListener { e -> call.reject("addGeofences failed: ${e.message}") }
        } catch (e: SecurityException) {
            call.reject("location permission missing: ${e.message}")
        }
    }

    /** removeAllGeofences() */
    @PluginMethod
    fun removeAllGeofences(call: PluginCall) {
        geofencingClient.removeGeofences(geofencePendingIntent)
            .addOnSuccessListener { call.resolve() }
            .addOnFailureListener { e -> call.reject("removeGeofences failed: ${e.message}") }
    }

    /** Emit a transition event to JS (called from the broadcast receiver). */
    fun emitTransition(ids: List<String>, transition: String) {
        val data = JSObject()
        data.put("transition", transition) // "enter" | "exit"
        val arr = JSArray()
        ids.forEach { arr.put(it) }
        data.put("ids", arr)
        notifyListeners("geofenceTransition", data)
    }

    companion object {
        @Volatile
        var instance: GeofencePlugin? = null
    }
}
