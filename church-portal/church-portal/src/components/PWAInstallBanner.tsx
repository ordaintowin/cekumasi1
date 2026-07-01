import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";
import { useLocation } from "wouter";

const DISMISSED_KEY = "pwa_install_dismissed_session";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isAndroidChrome() {
  return /android/i.test(navigator.userAgent) && /chrome/i.test(navigator.userAgent);
}

function wasDismissedThisSession(): boolean {
  return sessionStorage.getItem(DISMISSED_KEY) === "1";
}

function dismissForSession() {
  sessionStorage.setItem(DISMISSED_KEY, "1");
}

export default function PWAInstallBanner() {
  const [location] = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [iosStep, setIosStep] = useState(false);

  const isRegisterPage = location === "/register" || location.startsWith("/register/");

  useEffect(() => {
    if (isStandalone() || wasDismissedThisSession() || isRegisterPage) return;

    if (isIOS()) {
      setShowIOS(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (isAndroidChrome()) setShowAndroid(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, [isRegisterPage]);

  useEffect(() => {
    if (isRegisterPage) {
      setShowAndroid(false);
      setShowIOS(false);
    }
  }, [isRegisterPage]);

  function handleDismiss() {
    dismissForSession();
    setShowAndroid(false);
    setShowIOS(false);
    setDeferredPrompt(null);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowAndroid(false);
      setDeferredPrompt(null);
    } else {
      handleDismiss();
    }
  }

  if (!showAndroid && !showIOS) return null;

  return (
    <>
      {showAndroid && (
        <div className="fixed bottom-4 left-3 right-3 z-[9999] animate-in slide-in-from-bottom duration-300 sm:left-auto sm:right-4 sm:w-80">
          <div className="bg-white rounded-xl shadow-xl border border-purple-100 overflow-hidden flex items-center gap-3 px-3 py-2.5">
            <img src="/icon-192.png" alt="App icon" className="w-9 h-9 rounded-lg shadow flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 font-semibold text-xs leading-tight">Install CE Kumasi 1</p>
              <p className="text-gray-400 text-[11px]">Add to home screen</p>
            </div>
            <button
              onClick={handleInstall}
              className="flex-shrink-0 bg-purple-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Install
            </button>
            <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showIOS && (
        <div className="fixed bottom-4 left-3 right-3 z-[9999] animate-in slide-in-from-bottom duration-300 sm:left-auto sm:right-4 sm:w-80">
          <div className="bg-white rounded-xl shadow-xl border border-purple-100 overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <img src="/icon-192.png" alt="App icon" className="w-9 h-9 rounded-lg shadow flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-semibold text-xs leading-tight">Install CE Kumasi 1</p>
                <p className="text-gray-400 text-[11px]">Add to Home Screen</p>
              </div>
              <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 pb-3">
              {!iosStep ? (
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                  <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Share className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-800">Tap Share in Safari</p>
                    <p className="text-[11px] text-gray-500">then "Add to Home Screen"</p>
                  </div>
                  <button onClick={() => setIosStep(true)} className="text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-md px-2 py-1">
                    Next →
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                  <div className="w-7 h-7 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <img src="/icon-192.png" alt="" className="w-5 h-5 rounded-md" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-800">Tap "Add to Home Screen"</p>
                    <p className="text-[11px] text-gray-500">in the Share menu</p>
                  </div>
                  <button onClick={handleDismiss} className="text-[11px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                    Done ✓
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
