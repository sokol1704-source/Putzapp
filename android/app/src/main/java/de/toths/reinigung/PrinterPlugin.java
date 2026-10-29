package de.toths.reinigung;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Öffnet den Android-Druckdialog für die aktuelle Seite (Rechnung).
 * Dort kann man drucken oder „Als PDF speichern“ wählen.
 * Nötig, weil window.print() im Android-WebView nichts tut.
 */
@CapacitorPlugin(name = "Printer")
public class PrinterPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Dokument");
        getActivity().runOnUiThread(() -> {
            PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build();
            printManager.print(name, getBridge().getWebView().createPrintDocumentAdapter(name), attributes);
            call.resolve();
        });
    }
}
