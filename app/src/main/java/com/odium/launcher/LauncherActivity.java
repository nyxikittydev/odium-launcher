package com.odium.launcher;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.BatteryManager;
import android.view.HapticFeedbackConstants;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.util.LruCache;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/** Odium Launcher: a HOME activity whose UI is a WebView (assets/index.html). */
public class LauncherActivity extends Activity {
    private WebView web;
    private PackageManager pm;
    private SharedPreferences sp;
    private final LruCache<String, byte[]> icons = new LruCache<>(300);
    private int insetTop, insetBottom;

    private final BroadcastReceiver pkgReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { js("window.odiumApps&&odiumApps()"); }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        pm = getPackageManager();
        sp = getSharedPreferences("odium", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT); // let the system wallpaper show through
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "Odium");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("odium.icon".equals(u.getHost())) {
                    byte[] png = icon(u.getQueryParameter("id"));
                    if (png != null) return new WebResourceResponse("image/png", null, new ByteArrayInputStream(png));
                }
                return super.shouldInterceptRequest(v, r);
            }
            @Override public void onPageFinished(WebView v, String url) { sendInsets(); }
        });
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        web.setOnApplyWindowInsetsListener((v, ins) -> {
            float d = getResources().getDisplayMetrics().density;
            insetTop = Math.round(ins.getSystemWindowInsetTop() / d);
            insetBottom = Math.round(ins.getSystemWindowInsetBottom() / d);
            sendInsets();
            return ins;
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_CHANGED);
        f.addDataScheme("package");
        registerReceiver(pkgReceiver, f);
        js("window.odiumApps&&odiumApps()");
    }

    @Override protected void onStop() { super.onStop(); unregisterReceiver(pkgReceiver); }

    @Override
    protected void onNewIntent(Intent i) { // Home pressed while we're already showing
        super.onNewIntent(i);
        js("window.odiumHome&&odiumHome()");
    }

    @Override public void onBackPressed() { js("window.odiumBack&&odiumBack()"); } // a launcher never exits

    private void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }
    private void sendInsets() { js("window.odiumInsets&&odiumInsets(" + insetTop + "," + insetBottom + ")"); }

    private ComponentName component(String id) {
        int i = id == null ? -1 : id.indexOf('/');
        return i < 0 ? null : new ComponentName(id.substring(0, i), id.substring(i + 1));
    }

    private byte[] icon(String id) {
        byte[] hit = icons.get(id);
        if (hit != null) return hit;
        ComponentName cn = component(id);
        if (cn == null) return null;
        try {
            Drawable d = pm.getActivityIcon(cn);
            int s = 144;
            Bitmap bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
            d.setBounds(0, 0, s, s);
            d.draw(new Canvas(bmp));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
            icons.put(id, out.toByteArray());
            return out.toByteArray();
        } catch (Exception e) { return null; }
    }

    private String idOf(ResolveInfo ri) { return ri.activityInfo.packageName + "/" + ri.activityInfo.name; }

    public class Bridge {
        @JavascriptInterface
        public String apps() {
            JSONArray arr = new JSONArray();
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            for (ResolveInfo ri : pm.queryIntentActivities(q, 0)) {
                if (ri.activityInfo.packageName.equals(getPackageName())) continue;
                try {
                    arr.put(new JSONObject().put("id", idOf(ri)).put("n", ri.loadLabel(pm).toString()));
                } catch (Exception ignored) { }
            }
            return arr.toString();
        }

        /** First-run dock: Odium Terminal if installed, then phone / messages / browser / camera. */
        @JavascriptInterface
        public String defaultDock() {
            List<Intent> wants = new ArrayList<>();
            wants.add(new Intent(Intent.ACTION_DIAL));
            wants.add(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING));
            wants.add(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER));
            wants.add(new Intent(android.provider.MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA));
            JSONArray out = new JSONArray();
            Intent term = pm.getLaunchIntentForPackage("com.odium.terminal");
            if (term != null && term.getComponent() != null)
                out.put(term.getComponent().getPackageName() + "/" + term.getComponent().getClassName());
            for (Intent i : wants) {
                try {
                    ResolveInfo ri = pm.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY);
                    if (ri == null) continue;
                    Intent l = pm.getLaunchIntentForPackage(ri.activityInfo.packageName);
                    if (l != null && l.getComponent() != null && out.length() < 5)
                        out.put(l.getComponent().getPackageName() + "/" + l.getComponent().getClassName());
                } catch (Exception ignored) { }
            }
            return out.toString();
        }

        @JavascriptInterface
        public void launch(String id) {
            ComponentName cn = component(id);
            if (cn == null) return;
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(cn).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            try { startActivity(i); } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void appInfo(String id) {
            ComponentName cn = component(id);
            if (cn == null) return;
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + cn.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }

        @JavascriptInterface
        public void uninstall(String id) {
            ComponentName cn = component(id);
            if (cn == null) return;
            startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + cn.getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }

        @JavascriptInterface
        public void chooseLauncher() {
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }

        @JavascriptInterface
        public String battery() {
            Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b == null) return "{}";
            int st = b.getIntExtra("status", -1);
            boolean ch = st == BatteryManager.BATTERY_STATUS_CHARGING || st == BatteryManager.BATTERY_STATUS_FULL;
            return "{\"level\":" + (b.getIntExtra("level", 0) * 100 / Math.max(b.getIntExtra("scale", 100), 1)) + ",\"charging\":" + ch + "}";
        }

        @JavascriptInterface
        public boolean torch(boolean on) {
            try {
                CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                for (String id : cm.getCameraIdList()) {
                    if (Boolean.TRUE.equals(cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE))) {
                        cm.setTorchMode(id, on);
                        return on;
                    }
                }
            } catch (Exception ignored) { }
            return false;
        }

        @JavascriptInterface
        public void haptic() { runOnUiThread(() -> web.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)); }

        @JavascriptInterface public String getPrefs() { return sp.getString("prefs", "{}"); }
        @JavascriptInterface public void setPrefs(String json) { sp.edit().putString("prefs", json).apply(); }
    }
}
