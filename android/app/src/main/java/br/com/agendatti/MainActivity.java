package br.com.agendatti;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Agenda TTI no Android.
 *
 * O aplicativo é a própria plataforma: a tela é a mesma do site, e por isso não existe uma segunda
 * versão para manter nem aplicativo atrasado em relação ao servidor.
 *
 * Ele tenta primeiro o endereço publicado (APP_URL). Sem internet e sem nada guardado, cai na cópia
 * que vai dentro do aplicativo (assets/index.html), para a pessoa nunca ver uma tela em branco.
 *
 * Quando o servidor próprio existir, basta trocar APP_URL pelo domínio e recompilar.
 */
public class MainActivity extends Activity {

  /** Endereço da plataforma. Trocar pelo domínio próprio quando o servidor estiver no ar. */
  private static final String APP_URL = "https://copy9.github.io/agenda-tti/";
  private static final String FALLBACK_URL = "file:///android_asset/index.html";
  private static final int FILE_PICK = 1001;

  private WebView web;
  private ValueCallback<Uri[]> pendingFiles;
  private boolean usedFallback = false;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);

    web = new WebView(this);
    web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    web.setBackgroundColor(Color.parseColor("#F5F2EC"));

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true); // a plataforma guarda sessão e preferências aqui
    s.setDatabaseEnabled(true);
    s.setLoadsImagesAutomatically(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);
    s.setSupportZoom(false);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);

    web.setWebChromeClient(new WebChromeClient() {
      // Sem isto, o proprietário não consegue escolher foto da casa dentro do aplicativo.
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (pendingFiles != null) pendingFiles.onReceiveValue(null);
        pendingFiles = callback;
        try {
          startActivityForResult(params.createIntent(), FILE_PICK);
        } catch (Exception e) {
          pendingFiles = null;
          return false;
        }
        return true;
      }
    });

    web.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u = req.getUrl();
        String host = u.getHost() == null ? "" : u.getHost();
        // Links da própria plataforma abrem dentro do aplicativo; o resto vai para o navegador,
        // inclusive o pagamento, que precisa acontecer no ambiente do Mercado Pago.
        if (host.equals(Uri.parse(APP_URL).getHost())) return false;
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
          return false;
        }
        return true;
      }

      @Override
      public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
        if (req != null && req.isForMainFrame() && !usedFallback) {
          usedFallback = true;
          view.loadUrl(FALLBACK_URL);
        }
      }
    });

    setContentView(web);

    if (state != null) web.restoreState(state);
    else web.loadUrl(APP_URL);
  }

  @Override
  protected void onActivityResult(int code, int result, Intent data) {
    if (code == FILE_PICK) {
      if (pendingFiles != null) {
        pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        pendingFiles = null;
      }
      return;
    }
    super.onActivityResult(code, result, data);
  }

  /** O botão voltar do aparelho navega dentro da plataforma antes de sair do aplicativo. */
  @Override
  public boolean onKeyDown(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
      web.goBack();
      return true;
    }
    return super.onKeyDown(code, e);
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    if (web != null) web.saveState(out);
  }
}
