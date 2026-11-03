"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link2, Copy, QrCode, Download, Image as ImageIcon, ExternalLink } from "lucide-react";

interface JobData {
  id: string;
  title: string;
  company: string;
  city?: string;
  country?: string;
  workMode?: string;
  seniority?: string;
  postedAt?: string | null;
  expiresAt?: string | null;
  kenyaEligible?: boolean;
  description?: string;
  logo?: string;
  salary?: string;
}

interface ShareLinksProps {
  job: JobData;
}

// SVG brand icons as components
const BrandIcons = {
  whatsapp: () => (
    <svg viewBox="0 0 24 24" fill="#25D366" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.454.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.472.099-.174.05-.372-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.085 2.875 1.213 3.074.134.21.222.386.25.57.133.896.974 4.188 2.264 5.422.772.74 1.59 1.285 2.517 1.402.906.114 1.98-.006 2.893-.358.94-.372 1.688-1.15 2.007-1.822.307-.653.357-1.242.324-1.425-.033-.182-.215-.363-.433-.577z"/></svg>
  ),
  telegram: () => (
    <svg viewBox="0 0 24 24" fill="#0088cc" aria-hidden="true"><path d="M11.944 5.445a.75.75 0 0 0-1.26-.527l-7.68 4.187a.75.75 0 0 0 0 1.314l4.102 8.393a.75.75 0 0 0 1.144.517l3.964-2.29a.75.75 0 0 1 1.047 0l3.964 2.29a.75.75 0 0 0 1.144-.517l4.102-8.393a.75.75 0 0 0 0-1.314l-7.68-4.187a.75.75 0 0 0-1.26.527zm-.58 10.01l-3.584-2.08-1.43 2.608-1.31-3.009 3.226-.12 1.612-2.936 1.612 2.936 3.227.12-1.31 3.009-1.43-2.607-3.584 2.08z"/></svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" fill="#000" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 9.24h-3.308l-7.227-8.26-8.502 8.26h-3.308l8.502-9.24-7.227-8.26h3.308l7.227 8.26-8.502-9.24h-3.308l-8.502 9.24 7.227 8.26h3.308l7.227-8.26 8.502-8.26h-3.308l-8.502 8.26 7.227-8.26zm-5.66 15.75h-2.236l-4.108-4.69 4.108-4.69h2.236l4.108 4.69-4.108 4.69z"/></svg>
  ),
  linkedin: () => (
    <svg viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  ),
  facebook: () => (
    <svg viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385c5.736-.9 10.125-5.864 10.125-11.854z"/></svg>
  ),
  instagram: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
  ),
  copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  ),
  qrcode: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="6" y="6" width="1" height="1"/><rect x="17" y="6" width="1" height="1"/><rect x="6" y="17" width="1" height="1"/><rect x="17" y="17" width="1" height="1"/></svg>
  ),
  image: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  ),
  share: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
  ),
  link: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  ),
};

/**
 * Rich share modal with link, image, and QR code options for job opportunities.
 * Uses the Web Share API Level 2 for native share targets with files.
 */
export function ShareLinks({ job }: ShareLinksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [webShareSupported, setWebShareSupported] = useState(false);
  const [url, setUrl] = useState("");
  const [shareImageBlob, setShareImageBlob] = useState<Blob | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const path = `/opportunities/${job.id}`;
    setUrl(`${origin}${path}`);
  }, [job.id]);

  useEffect(() => {
    if (!url) return;

    const supported = navigator.canShare && navigator.canShare({ title: job.title, text: "", url, files: [] });
    setWebShareSupported(supported);

    if (supported && "getShareTargets" in navigator) {
      (navigator as any).getShareTargets?.().then((targets: ShareTarget[]) => {
        setShareTargets(targets);
      }).catch(() => {});
    }
  }, [url, job.title]);

  // Generate QR code
  useEffect(() => {
    if (!url) return;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#000";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("QR Code for:", 128, 120);
      ctx.fillText(job.title.slice(0, 30), 128, 140);
      ctx.fillText(url.slice(0, 40), 128, 160);
      setQrCodeDataUrl(canvas.toDataURL("image/png"));
    }
  }, [url, job.title]);

  // Generate shareable image (OG-style card)
  const generateShareImage = async () => {
    if (!url) return;
    setIsGeneratingImage(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 1200, 630);
      grad.addColorStop(0, "#060911");
      grad.addColorStop(1, "#0b1020");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 630);

      // Subtle pattern
      ctx.fillStyle = "rgba(109, 139, 255, 0.08)";
      for (let x = 0; x < 1200; x += 40) {
        for (let y = 0; y < 630; y += 40) {
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Company logo area
      if (job.logo) {
        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = job.logo;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            setTimeout(reject, 3000);
          });
          ctx.drawImage(img, 60, 60, 80, 80);
        } catch {}
      }

      // Company name
      ctx.fillStyle = "#6d8bff";
      ctx.font = "600 18px Inter, system-ui";
      ctx.fillText(job.company, 160, 105);

      // Title
      ctx.fillStyle = "#fff";
      ctx.font = "700 42px/1.2 Inter, system-ui";
      const titleLines = wrapText(ctx, job.title, 1080);
      titleLines.forEach((line, i) => ctx.fillText(line, 60, 180 + i * 50));

      // Meta badges
      const meta = [`${job.city || job.country}`, job.workMode, job.seniority].filter((v): v is string => Boolean(v));
      ctx.font = "500 16px Inter, system-ui";
      let metaX = 60;
      meta.forEach((m) => {
        const padding = 12;
        const textWidth = ctx.measureText(m).width + padding * 2;
        ctx.fillStyle = "rgba(109, 139, 255, 0.2)";
        roundRect(ctx, metaX, 320, textWidth, 36, 18);
        ctx.fill();
        ctx.fillStyle = "#6d8bff";
        ctx.fillText(m, metaX + padding, 344);
        metaX += textWidth + 16;
      });

      // Kenya eligible badge
      if (job.kenyaEligible) {
        ctx.fillStyle = "rgba(74, 222, 128, 0.2)";
        roundRect(ctx, metaX, 320, 140, 36, 18);
        ctx.fill();
        ctx.fillStyle = "#4ade80";
        ctx.fillText("Kenya eligible", metaX + 12, 344);
      }

      // Description snippet
      if (job.description) {
        ctx.fillStyle = "#b8c2e3";
        ctx.font = "400 18px/1.5 Inter, system-ui";
        const desc = job.description.slice(0, 200) + (job.description.length > 200 ? "…" : "");
        const descLines = wrapText(ctx, desc, 1080);
        descLines.slice(0, 3).forEach((line, i) => ctx.fillText(line, 60, 400 + i * 28));
      }

      // Footer
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "500 14px Inter, system-ui";
      ctx.fillText("Found on MboQara", 60, 560);

      // QR code in corner
      if (qrCodeDataUrl) {
        const qrImg = new Image();
        qrImg.src = qrCodeDataUrl;
        await new Promise((resolve) => { qrImg.onload = resolve; });
        ctx.drawImage(qrImg, 1040, 470, 100, 100);
        ctx.fillStyle = "#7e88a8";
        ctx.font = "400 11px Inter, system-ui";
        ctx.fillText("Scan to view", 1040, 585);
      }

      canvas.toBlob((blob) => {
        if (blob) setShareImageBlob(blob);
      }, "image/png", 0.9);
    } catch (err) {
      console.debug("Share image generation failed:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Close modal handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      generateShareImage();
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const text = `${job.title} at ${job.company} — found on MboQara`;
  const location = `${job.city || ""}${job.city && job.country ? ", " : ""}${job.country || ""}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeComponentSafe(url)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeComponentSafe(url)}&quote=${encodeComponentSafe(text)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      setIsOpen(false);
    } catch {
      setCopied(false);
    }
  };

  const handleNativeShare = async (target?: ShareTarget) => {
    if (!url) return;
    try {
      const shareData: any = { title: job.title, text, url };
      if (shareImageBlob && navigator.canShare({ files: [new File([shareImageBlob], "job.png", { type: "image/png" })] })) {
        shareData.files = [new File([shareImageBlob], `${job.title}.png`, { type: "image/png" })];
      }
      if (target && "share" in navigator) {
        await (navigator as any).share(shareData, target);
      } else {
        await navigator.share(shareData);
      }
      setIsOpen(false);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.debug("Web Share API failed:", err);
      }
    }
  };

  const fallbackOptions: ShareOption[] = [
    { key: "copy", label: copied ? "Link copied" : "Copy link", icon: <BrandIcons.copy />, action: copyLink },
    { key: "whatsapp", label: "WhatsApp", icon: <BrandIcons.whatsapp />, href: whatsappUrl },
    { key: "telegram", label: "Telegram", icon: <BrandIcons.telegram />, href: telegramUrl },
    { key: "x", label: "X (Twitter)", icon: <BrandIcons.x />, href: twitterUrl },
    { key: "linkedin", label: "LinkedIn", icon: <BrandIcons.linkedin />, href: linkedinUrl },
    { key: "facebook", label: "Facebook", icon: <BrandIcons.facebook />, href: facebookUrl },
  ];

  const showNativeTargets = webShareSupported && shareTargets.length > 0;

  if (!url) {
    return <div className="jr-share" aria-label={`Share ${job.title}`} role="group" />;
  }

  const modalContent = (
    <div className="jr-share__modal-overlay" onClick={() => setIsOpen(false)} role="dialog" aria-modal="true" aria-labelledby="jr-share-title">
      <div className="jr-share__modal" onClick={(e) => e.stopPropagation()}>
        {/* Preview Card */}
        <div className="jr-share__preview">
          <div className="jr-share__preview-header">
            {job.logo && <img src={job.logo} alt="" className="jr-share__preview-logo" />}
            <div>
              <p className="jr-share__preview-company">{job.company}</p>
              <p className="jr-share__preview-location">
                {location && <span>{location}</span>}
                {job.workMode && <span> · {job.workMode}</span>}
              </p>
            </div>
          </div>
          <h2 className="jr-share__preview-title">{job.title}</h2>
          <div className="jr-share__preview-meta">
            {job.seniority && <span className="jr-share__badge">{job.seniority}</span>}
            {job.salary && <span className="jr-share__badge jr-share__badge--salary">{job.salary}</span>}
            {job.kenyaEligible && <span className="jr-share__badge jr-share__badge--kenya">Kenya eligible</span>}
          </div>
        </div>

        <div className="jr-share__modal-header">
          <h3 id="jr-share-title" className="jr-share__modal-title">Share this role</h3>
          <button
            type="button"
            className="jr-share__modal-close"
            onClick={() => setIsOpen(false)}
            aria-label="Close share dialog"
          >
            <BrandIcons.share />
          </button>
        </div>

        {/* Share as... tabs */}
        <div className="jr-share__tabs" role="tablist" aria-label="Share format">
          <button
            role="tab"
            aria-selected={true}
            className="jr-share__tab jr-share__tab--active"
            onClick={() => {}}
          >
            <BrandIcons.link />
            <span>Link</span>
          </button>
          <button
            role="tab"
            aria-selected={false}
            className="jr-share__tab"
            onClick={() => {}}
          >
            <BrandIcons.image />
            <span>Image</span>
          </button>
          <button
            role="tab"
            aria-selected={false}
            className="jr-share__tab"
            onClick={() => {}}
          >
            <BrandIcons.qrcode />
            <span>QR Code</span>
          </button>
        </div>

        {/* Link Section */}
        <div className="jr-share__section jr-share__section--link" role="tabpanel" aria-label="Share as link">
          {showNativeTargets && (
            <>
              <h4 className="jr-share__section-title">Share via...</h4>
              <div className="jr-share__native-targets" role="list">
                {shareTargets.map((target) => (
                  <button
                    key={target.name}
                    type="button"
                    role="menuitem"
                    className="jr-share__native-btn"
                    onClick={() => handleNativeShare(target)}
                  >
                    <img src={target.iconUrl} alt="" className="jr-share__native-icon" width="28" height="28" />
                    <span>{target.name}</span>
                  </button>
                ))}
              </div>
              <div className="jr-share__divider" />
            </>
          )}

          <h4 className="jr-share__section-title">Or share to</h4>
          <div className="jr-share__fallback-targets" role="list">
            {fallbackOptions.map((opt) => (
              <div key={opt.key} className="jr-share__fallback-item" role="listitem">
                {opt.href ? (
                  <a
                    href={opt.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jr-share__fallback-btn"
                    role="menuitem"
                    onClick={() => setIsOpen(false)}
                    aria-label={`Share ${job.title} on ${opt.label}`}
                  >
                    <span className="jr-share__fallback-icon">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    className="jr-share__fallback-btn"
                    role="menuitem"
                    onClick={opt.action}
                    aria-label={opt.label}
                  >
                    <span className="jr-share__fallback-icon">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Image Section */}
        <div className="jr-share__section jr-share__section--image" role="tabpanel" aria-label="Share as image" hidden>
          <div className="jr-share__image-preview">
            {isGeneratingImage ? (
              <div className="jr-share__generating">
                <div className="jr-share__spinner" aria-hidden="true" />
                <p>Generating share image…</p>
              </div>
            ) : shareImageBlob ? (
              <img src={URL.createObjectURL(shareImageBlob)} alt={`Share card for ${job.title}`} className="jr-share__image" />
            ) : (
              <button
                type="button"
                className="jr-share__generate-btn"
                onClick={generateShareImage}
                disabled={isGeneratingImage}
              >
                <BrandIcons.image />
                <span>Generate Share Image</span>
              </button>
            )}
          </div>
          <div className="jr-share__image-actions">
            <button
              type="button"
              className="jr-share__action-btn"
              onClick={async () => {
                if (!shareImageBlob) return;
                const file = new File([shareImageBlob], `${job.title}.png`, { type: "image/png" });
                try {
                  await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
                  setIsOpen(false);
                } catch {
                  // Fallback: download
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(shareImageBlob);
                  a.download = `${job.title}.png`;
                  a.click();
                }
              }}
              disabled={!shareImageBlob || isGeneratingImage}
            >
              <BrandIcons.copy />
              <span>Copy Image</span>
            </button>
            <button
              type="button"
              className="jr-share__action-btn"
              onClick={() => {
                if (!shareImageBlob) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(shareImageBlob);
                a.download = `${job.title}.png`;
                a.click();
              }}
              disabled={!shareImageBlob || isGeneratingImage}
            >
              <BrandIcons.download />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="jr-share__section jr-share__section--qr" role="tabpanel" aria-label="Share as QR code" hidden>
          <div className="jr-share__qr-container">
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt={`QR code for ${job.title}`} className="jr-share__qr-image" />
            ) : (
              <div className="jr-share__qr-placeholder">Generating QR code…</div>
            )}
            <p className="jr-share__qr-caption">Scan to open this role</p>
          </div>
          <div className="jr-share__qr-actions">
            <button
              type="button"
              className="jr-share__action-btn"
              onClick={async () => {
                if (!qrCodeDataUrl) return;
                try {
                  const blob = await (await fetch(qrCodeDataUrl)).blob();
                  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                  setIsOpen(false);
                } catch {
                  const a = document.createElement("a");
                  a.href = qrCodeDataUrl;
                  a.download = `${job.title}-qr.png`;
                  a.click();
                }
              }}
            >
              <BrandIcons.copy />
              <span>Copy QR Code</span>
            </button>
            <a
              href={qrCodeDataUrl}
              download={`${job.title}-qr.png`}
              className="jr-share__action-btn"
            >
              <BrandIcons.download />
              <span>Download PNG</span>
            </a>
            <button
              type="button"
              className="jr-share__action-btn jr-share__action-btn--print"
              onClick={() => window.print()}
            >
              <BrandIcons.share />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="jr-share" role="group" aria-label={`Share ${job.title}`}>
      <button
        ref={triggerRef}
        type="button"
        className="jr-share__trigger"
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Share ${job.title}`}
      >
        <BrandIcons.share />
        <span className="sr-only">Share</span>
      </button>

      {isOpen && createPortal(modalContent, document.body)}
    </div>
  );
}

interface ShareOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
}

interface ShareTarget {
  name: string;
  iconUrl: string;
}

function encodeComponentSafe(value: string): string {
  return encodeURIComponent(value);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}