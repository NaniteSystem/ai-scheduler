package com.scheduler.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** A compact launcher widget for the three most frequent Nebulla actions. */
public class QuickActionsWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_actions);
            views.setOnClickPendingIntent(R.id.widget_capture, deepLink(context, "capture", 10));
            views.setOnClickPendingIntent(R.id.widget_today_action, deepLink(context, "today", 11));
            views.setOnClickPendingIntent(R.id.widget_calendar_action, deepLink(context, "calendar", 12));
            manager.updateAppWidget(id, views);
        }
    }

    private PendingIntent deepLink(Context context, String destination, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("nebulla://" + destination));
        intent.setPackage(context.getPackageName());
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
