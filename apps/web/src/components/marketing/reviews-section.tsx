"use client";

import { useMemo, useState } from "react";
import { Star, ThumbsUp, MessageSquarePlus } from "lucide-react";
import { useApi } from "@/lib/hooks";

interface Review {
  id: string;
  name: string;
  role: string | null;
  rating: number;
  title: string | null;
  body: string;
  recommend: boolean;
  createdAt: string;
}

interface Summary {
  average: number;
  total: number;
  recommendRate: number;
  generatedAt: string;
}

const API = (process.env.NEXT_PUBLIC_API_URL ?? "https://mboqara-api-angisoft.fly.dev/v1").replace(/\/$/, "");

function Stars({ value }: { value: number }) {
  return (
    <span className="jr-stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          fill={n <= value ? "currentColor" : "none"}
          className={n <= value ? "is-filled" : "is-empty"}
        />
      ))}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function ReviewForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "",
    rating: 5,
    title: "",
    body: "",
    recommend: true,
  });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const response = await fetch(`${API}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not send your review");
      }
      setState("done");
      onDone();
    } catch (caught) {
      setState("error");
      setError(caught instanceof Error ? caught.message : "Could not send your review");
    }
  };

  if (state === "done") {
    return (
      <div className="jr-review-form jr-review-form--done" role="status">
        <h3>Thank you — that means a lot</h3>
        <p>
          Your review is with our team and appears here once it has been checked. We read every one.
        </p>
      </div>
    );
  }

  return (
    <form className="jr-review-form" onSubmit={submit}>
      <div className="jr-review-form__row">
        <label>
          <span>Your name</span>
          <input
            required
            minLength={2}
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Amara Mwangi"
          />
        </label>
        <label>
          <span>Email (never shown)</span>
          <input
            required
            type="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
        </label>
      </div>
      <div className="jr-review-form__row">
        <label>
          <span>What you do (optional)</span>
          <input
            maxLength={80}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="Product designer"
          />
        </label>
        <div className="jr-review-form__rating">
          <span>Your rating</span>
          <div className="jr-review-form__stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setForm({ ...form, rating: n })}
              >
                <Star aria-hidden="true" fill={n <= form.rating ? "currentColor" : "none"} className={n <= form.rating ? "is-filled" : "is-empty"} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <label>
        <span>Headline (optional)</span>
        <input
          maxLength={120}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Found a role in three weeks"
        />
      </label>
      <label>
        <span>Your review</span>
        <textarea
          required
          minLength={20}
          maxLength={1200}
          rows={4}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="What happened, and how did MboQara help?"
        />
      </label>
      <label className="jr-review-form__check">
        <input
          type="checkbox"
          checked={form.recommend}
          onChange={(e) => setForm({ ...form, recommend: e.target.checked })}
        />
        <span><ThumbsUp aria-hidden="true" /> I would recommend MboQara to a friend</span>
      </label>
      {error ? <p className="jr-review-form__error">{error}</p> : null}
      <button type="submit" className="mk-btn mk-btn--primary mk-btn--lg" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send my review"}
      </button>
    </form>
  );
}

export function ReviewsSection() {
  const reviews = useApi<{ reviews: Review[] }>("/reviews");
  const summary = useApi<{ total: number; average: number; recommendRate: number }>("/reviews/summary");
  const [formOpen, setFormOpen] = useState(false);

  const list = reviews.data?.reviews ?? [];
  const stats = summary.data;

  const average = useMemo(() => {
    if (stats && stats.total > 0) return stats.average;
    if (list.length === 0) return 0;
    return Math.round((list.reduce((sum, r) => sum + r.rating, 0) / list.length) * 10) / 10;
  }, [stats, list]);

  return (
    <section className="mk-section jr-reviews" id="reviews" aria-labelledby="reviews-heading">
      <div className="mk-container">
        <header className="mk-section-header">
          <span className="mk-section-eyebrow">Reviews</span>
          <h2 id="reviews-heading" className="mk-section-heading">What job seekers say</h2>
          <p className="mk-lede">
            Every review below comes from someone who used MboQara. Add yours and we will publish it
            once it has been checked.
          </p>
        </header>

        {stats && stats.total > 0 ? (
          <div className="jr-reviews__stats">
            <div>
              <strong>{average.toFixed(1)}</strong>
              <Stars value={Math.round(average)} />
              <span>average rating</span>
            </div>
            <div>
              <strong>{stats.total}</strong>
              <span>reviews published</span>
            </div>
            <div>
              <strong>{stats.recommendRate}%</strong>
              <span>would recommend MboQara</span>
            </div>
          </div>
        ) : null}

        {list.length > 0 ? (
          <div className="jr-reviews__grid">
            {list.slice(0, 6).map((review) => (
              <article className="jr-review" key={review.id}>
                <Stars value={review.rating} />
                {review.title ? <h3 className="jr-review__title">{review.title}</h3> : null}
                <p className="jr-review__body">{review.body}</p>
                <footer className="jr-review__author">
                  <span className="jr-review__avatar" aria-hidden="true">{initials(review.name)}</span>
                  <span>
                    <strong>{review.name}</strong>
                    <small>{review.role || "MboQara user"}</small>
                  </span>
                  {review.recommend ? (
                    <span className="jr-review__badge"><ThumbsUp aria-hidden="true" /> Recommends</span>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <p className="jr-reviews__empty">
            No reviews published yet — yours would be the first.
          </p>
        )}

        <div className="jr-reviews__cta">
          {formOpen ? (
            <ReviewForm onDone={() => setFormOpen(false)} />
          ) : (
            <button type="button" className="mk-btn mk-btn--primary mk-btn--lg" onClick={() => setFormOpen(true)}>
              <MessageSquarePlus aria-hidden="true" /> Write a review
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
