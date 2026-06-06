import Foundation
import Capacitor
import CoreLocation
import UserNotifications

/**
 * Native circular geofencing using CoreLocation region monitoring.
 *
 * iOS monitors the registered CLCircularRegions at the OS level — including
 * when the app is suspended or terminated — and relaunches the app in the
 * background on ENTER/EXIT. We re-emit the transition to JS via the
 * `geofenceTransition` event and post a local notification.
 *
 * Auto-discovered by Capacitor via the CAPBridgedPlugin conformance.
 */
@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "GeofencePlugin"
    public let jsName = "Geofence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "addGeofences", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAllGeofences", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CLLocationManager()

    public override func load() {
        manager.delegate = self
        manager.allowsBackgroundLocationUpdates = true
        manager.requestAlwaysAuthorization()
    }

    @objc func addGeofences(_ call: CAPPluginCall) {
        guard let geofences = call.getArray("geofences") as? [[String: Any]] else {
            call.reject("geofences array required")
            return
        }
        for gf in geofences {
            guard
                let id = gf["id"] as? String,
                let lat = gf["latitude"] as? Double,
                let lon = gf["longitude"] as? Double
            else { continue }
            let radius = (gf["radius"] as? Double) ?? 150.0
            let clamped = min(radius, manager.maximumRegionMonitoringDistance)
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                radius: clamped,
                identifier: id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
        }
        call.resolve()
    }

    @objc func removeAllGeofences(_ call: CAPPluginCall) {
        for region in manager.monitoredRegions {
            manager.stopMonitoring(for: region)
        }
        call.resolve()
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        handle(region: region, transition: "enter")
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        handle(region: region, transition: "exit")
    }

    private func handle(region: CLRegion, transition: String) {
        notifyListeners("geofenceTransition", data: [
            "transition": transition,
            "ids": [region.identifier]
        ])
        let title = transition == "enter" ? "Вы пришли на объект" : "Вы покинули объект"
        let body = transition == "enter"
            ? "GeoTime отметит начало смены. Откройте приложение для подтверждения."
            : "GeoTime приостановит смену. Вернитесь в зону, чтобы продолжить."
        postNotification(title: title, body: body)
    }

    private func postNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
}
