package com.scheduler.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/** Home-screen widget: today's sessions/tasks/habits + a quick-add shortcut. */
public class TodayWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateOne(context, manager, id);
    }

    /** Refresh every placed instance of the widget (called from the JS bridge). */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        for (int id : ids) updateOne(context, manager, id);
    }

    private static void updateOne(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(WidgetBridgePlugin.PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        String date = prefs.getString("date", "");
        String lines = prefs.getString("lines", "");
        String empty = prefs.getString("empty", "");
        views.setTextViewText(R.id.widget_date, date);
        views.setTextViewText(R.id.widget_lines, lines.isEmpty() ? empty : lines);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        Intent open = new Intent(context, MainActivity.class);
        views.setOnClickPendingIntent(R.id.widget_root,
                PendingIntent.getActivity(context, 0, open, flags));

        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("nebulla://capture"));
        add.setPackage(context.getPackageName());
        views.setOnClickPendingIntent(R.id.widget_add,
                PendingIntent.getActivity(context, 1, add, flags));

        manager.updateAppWidget(widgetId, views);
    }
}
