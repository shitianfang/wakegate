import type { Wakeup } from "../src/index.js";

type Scenario = { name: string; wake: boolean; wakeup: Omit<Wakeup, "skipped"> };

const hr = "A reply from Dana Li (HR at Acme) about scheduling my second-round interview";
const hrZh = "等字节跳动招聘的王女士回复二面时间";
const headphones = "Tell the user when the Sony WH-1000XM6 headphones drop below $300 at Best Buy";
const ci = "CI for PR #482 to finish, then merge it if it is green";
const parcel = "UPS parcel 1Z999AA10123456784 to be delivered, then tell the user";
const invoice = "Payment of invoice INV-2031 from Acme Corp, then send them the license key";

export const scenarios: Scenario[] = [
  { name: "HR wait: newsletter arrives", wake: false, wakeup: { waitingFor: hr, event: { type: "email", from: "noreply@medium.com", subject: "Your Daily Digest: 7 stories about AI agents" } } },
  { name: "HR wait: LinkedIn job alert that mentions Acme", wake: false, wakeup: { waitingFor: hr, event: { type: "email", from: "jobalerts-noreply@linkedin.com", subject: "Acme is hiring: Senior Backend Engineer and 4 more jobs" } } },
  { name: "HR wait: Dana replies", wake: true, wakeup: { waitingFor: hr, event: { type: "email", from: "dana.li@acme.com", subject: "Re: Second-round interview", snippet: "Hi, would Tuesday at 3pm work for you?" } } },
  { name: "HR wait: calendar invite for the interview", wake: true, wakeup: { waitingFor: hr, event: { type: "email", from: "calendar-notification@google.com", subject: "Invitation: Acme second-round interview @ Tue Sep 23, 3pm (dana.li@acme.com)" } } },
  { name: "HR wait: someone else at Acme recruiting writes", wake: true, wakeup: { waitingFor: hr, event: { type: "email", from: "recruiting@acme.com", subject: "Update on your application" } } },
  { name: "HR wait (ambiguous): personal address, vague subject", wake: true, wakeup: { waitingFor: hr, event: { type: "email", from: "dana.li.88@gmail.com", subject: "quick question" } } },
  { name: "HR wait: timer, inbox checked, nothing new", wake: false, wakeup: { waitingFor: hr, observation: { new_emails_since_sleep: [] } } },
  { name: "HR wait (Chinese): recruiter replies", wake: true, wakeup: { waitingFor: hrZh, event: { type: "email", from: "wang.fang@bytedance.com", subject: "回复：二面时间确认", snippet: "您好，周四下午两点可以吗？" } } },
  { name: "HR wait (Chinese): shopping promo", wake: false, wakeup: { waitingFor: hrZh, event: { type: "email", from: "service@jd.com", subject: "【京东】您关注的商品降价啦，限时抢购" } } },
  { name: "Price watch: timer, price unchanged", wake: false, wakeup: { waitingFor: headphones, observation: { price: 349.99, price_when_went_to_sleep: 349.99 } } },
  { name: "Price watch: price below target", wake: true, wakeup: { waitingFor: headphones, observation: { price: 279.99, price_when_went_to_sleep: 349.99 } } },
  { name: "Price watch: price dropped but still above target", wake: false, wakeup: { waitingFor: headphones, observation: { price: 329.99, price_when_went_to_sleep: 349.99 } } },
  { name: "Price watch (ambiguous): sold out", wake: true, wakeup: { waitingFor: headphones, observation: { price: null, availability: "Sold out", price_when_went_to_sleep: 349.99 } } },
  { name: "Price watch (ambiguous): price no longer found on page", wake: true, wakeup: { waitingFor: headphones, observation: { price: null, error: "price element not found on the product page" } } },
  { name: "BTC watch: still below threshold", wake: false, wakeup: { waitingFor: "Alert the user when BTC goes above $150,000", observation: "BTC/USD 142,310.55 (24h +0.4%)" } },
  { name: "CI wait: still running", wake: false, wakeup: { waitingFor: ci, observation: { status: "in_progress", elapsed: "14m" } } },
  { name: "CI wait: failed", wake: true, wakeup: { waitingFor: ci, observation: { status: "completed", conclusion: "failure", failed_job: "e2e (ubuntu-latest)" } } },
  { name: "Parcel wait: moved between facilities", wake: false, wakeup: { waitingFor: parcel, observation: { status: "In transit", last_scan: "Arrived at facility, Oakland CA", last_scan_when_went_to_sleep: "Departed facility, Reno NV" } } },
  { name: "Parcel wait: delivery exception", wake: true, wakeup: { waitingFor: parcel, observation: { status: "Exception", last_scan: "Address could not be verified. Contact UPS." } } },
  { name: "Invoice wait: the awaited invoice is paid", wake: true, wakeup: { waitingFor: invoice, event: { type: "invoice.paid", invoice: "INV-2031", customer: "Acme Corp", amount: 1200, currency: "usd" } } },
  { name: "Invoice wait: a different invoice is paid", wake: false, wakeup: { waitingFor: invoice, event: { type: "invoice.paid", invoice: "INV-1987", customer: "Globex", amount: 300, currency: "usd" } } },
];
