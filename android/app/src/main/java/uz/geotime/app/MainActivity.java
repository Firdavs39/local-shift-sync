package uz.geotime.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-embedded native plugins must be registered before super.onCreate.
        registerPlugin(GeofencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
