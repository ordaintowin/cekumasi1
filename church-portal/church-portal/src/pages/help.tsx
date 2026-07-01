import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { MessageCircle, Send, HelpCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_WHATSAPP = "233261827900";

export default function Help() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!title.trim() || !content.trim()) return;
    const senderName = (user as any)?.memberName || (user as any)?.username || "A Member";
    const text =
      `*Help Request from ${senderName}*\n` +
      `*Subject:* ${title.trim()}\n\n` +
      `${content.trim()}`;
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/${ADMIN_WHATSAPP}?text=${encoded}`, "_blank");
    setSent(true);
  }

  function handleReset() {
    setTitle("");
    setContent("");
    setSent(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider font-medium">
          <span>Support</span>
          <ChevronRight className="w-3 h-3" />
          <span>Help &amp; Contact</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Help &amp; Support</h1>
        <p className="text-sm text-gray-500">
          Have a question or need assistance? Send a message directly to the admin team via WhatsApp.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-700 to-purple-900">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Message Admin</p>
            <p className="text-xs text-purple-200">Christ Embassy Kumasi 1 — Admin Team</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-green-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </div>
        </div>

        {sent ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-800">WhatsApp Opened!</h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Your message has been prepared in WhatsApp. Tap <strong>Send</strong> there to deliver it to the admin.
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-2 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={handleReset}
            >
              Send Another Message
            </Button>
          </div>
        ) : (
          /* Form */
          <div className="p-6 space-y-5">
            {/* Subject */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Subject / Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Question about my department"
                maxLength={120}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Describe your question or concern in detail…"
                rows={6}
                maxLength={1000}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition resize-none"
              />
              <p className="text-xs text-gray-400 text-right">{content.length}/1000</p>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <MessageCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-green-700">
                Clicking <strong>Send via WhatsApp</strong> will open WhatsApp with your message pre-filled. Just tap <strong>Send</strong> inside WhatsApp to deliver it.
              </p>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSend}
              disabled={!title.trim() || !content.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Send via WhatsApp
            </Button>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-center text-gray-400">
        Messages are sent directly to the Christ Embassy Kumasi 1 admin team via WhatsApp.
      </p>
    </div>
  );
}
