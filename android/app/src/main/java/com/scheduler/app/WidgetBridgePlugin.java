package com.scheduler.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for the home-screen "Today" widget: the web app pushes a snapshot of
 * today's agenda here; we persist it in SharedPreferences and refresh the widget.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    static final String PREFS = "nebulla_widget";

    @PluginMethod
    public void setToday(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putString("date", call.getString("date", ""));
        e.putString("lines", call.getString("lines", ""));
        e.putString("empty", call.getString("empty", ""));
        e.apply();
        TodayWidgetProvider.updateAll(ctx);
        call.resolve();
    }
}
