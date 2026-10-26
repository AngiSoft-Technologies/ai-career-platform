"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui";
import clsx from "clsx";

export function ContactForm() {
  const toast = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    topic: "general",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof formData>>({});

  const validate = () => {
    const newErrors: Partial<typeof formData> = {};
    if (formData.name.trim().length < 2) newErrors.name = "Please enter your name (at least 2 characters)";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email)) newErrors.email = "Enter a valid email address";
    if (formData.message.trim().length < 10) newErrors.message = "Message must be at least 10 characters";
    if (formData.message.trim().length > 4000) newErrors.message = "Message is too long (max 4000 characters)";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/v1/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Something went wrong");
      }
      toast.push("Message sent — we'll get back to you soon", "success");
      setFormData({ name: "", email: "", topic: "general", message: "" });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed to send", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mk-contact-form" noValidate>
      <div className="mk-contact-form__grid">
        <div className="mk-contact-form__field">
          <label htmlFor="name" className="mk-contact-form__label">Name</label>
          <input
            id="name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={clsx("mk-contact-form__input", errors.name && "has-error")}
            placeholder="Your name"
            autoComplete="name"
            disabled={submitting}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name && <span id="name-error" className="mk-contact-form__error" role="alert">{errors.name}</span>}
        </div>
        <div className="mk-contact-form__field">
          <label htmlFor="email" className="mk-contact-form__label">Email</label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={clsx("mk-contact-form__input", errors.email && "has-error")}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={submitting}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && <span id="email-error" className="mk-contact-form__error" role="alert">{errors.email}</span>}
        </div>
      </div>

      <div className="mk-contact-form__field">
        <label htmlFor="topic" className="mk-contact-form__label">Topic</label>
        <select
          id="topic"
          value={formData.topic}
          onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
          className={clsx("mk-contact-form__select", errors.topic && "has-error")}
          disabled={submitting}
        >
          <option value="general">General inquiry</option>
          <option value="support">Technical support</option>
          <option value="partnership">Partnership / Business</option>
          <option value="press">Press / Media</option>
          <option value="security">Security issue</option>
          <option value="feedback">Feedback</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="mk-contact-form__field">
        <label htmlFor="message" className="mk-contact-form__label">Message</label>
        <textarea
          id="message"
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className={clsx("mk-contact-form__textarea", errors.message && "has-error")}
          placeholder="What can we help with?"
          rows={5}
          disabled={submitting}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
        />
        {errors.message && <span id="message-error" className="mk-contact-form__error" role="alert">{errors.message}</span>}
      </div>

      <button type="submit" className="mk-btn mk-btn--primary mk-btn--full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mk-btn__spinner" aria-hidden="true" />
            <span>Sending…</span>
          </>
        ) : (
          <>
            <Send className="mk-btn__icon" aria-hidden="true" />
            <span>Send message</span>
          </>
        )}
      </button>
    </form>
  );
}