import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

const DISMISSED_KEY = "pwa_install_dismissed_until";
const DISMISS_DAYS = 7;

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

function wasDismissedRecently(): boolean {
  const until = localStorage.getItem(DISMISSED_KEY);
  if (!until) return false;
  return Date.now() < parseInt(until, 10);
}

function dismissForNDays() {
  localStorage.setItem(
    DISMISSED_KEY,
    String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
  );
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [iosStep, setIosStep] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    if (isIOS()) {
      setShowIOS(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (isAndroidChrome()) {
        setShowAndroid(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  function handleDismiss() {
    dismissForNDays();
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
        <div className="fixed bottom-0 left-0 right-0 z-[9999] p-3 sm:p-4 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-700 to-purple-500 p-4 flex items-center gap-3">
              <img src="/icon-192.png" alt="App icon" className="w-12 h-12 rounded-xl shadow" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Install CE Kumasi 1</p>
                <p className="text-purple-200 text-xs mt-0.5">Add to your home screen for quick access</p>
              </div>
              <button
                onClick={handleDismiss}
                className="text-purple-200 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex gap-3">
              <button
                onClick={handleDismiss}
                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Not now
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Install App
              </button>
            </div>
          </div>
        </div>
      )}

      {showIOS && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] p-3 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-purple-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-700 to-purple-500 p-4 flex items-center gap-3">
              <img src="/icon-192.png" alt="App icon" className="w-12 h-12 rounded-xl shadow" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Install CE Kumasi 1</p>
                <p className="text-purple-200 text-xs mt-0.5">Add to Home Screen for the best experience</p>
              </div>
              <button
                onClick={handleDismiss}
                className="text-purple-200 hover:text-white p-1 rounded-full hover:bg-white/20 transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              {!iosStep ? (
                <>
                  <p className="text-sm text-gray-600 mb-3">Tap the <strong>Share</strong> button at the bottom of your browser:</p>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 mb-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Share className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Tap the Share icon</p>
                      <p className="text-xs text-gray-500">In Safari's bottom toolbar</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIosStep(true)}
                    className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors"
                  >
                    I tapped it — show next step
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-3">Now scroll down in the Share menu and tap <strong>"Add to Home Screen"</strong>:</p>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 mb-4">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <img src="/icon-192.png" alt="" className="w-7 h-7 rounded-lg" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Add to Home Screen</p>
                      <p className="text-xs text-gray-500">Tap the + button next to it</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDismiss}
                    className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors"
                  >
                    Done! Close this
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
