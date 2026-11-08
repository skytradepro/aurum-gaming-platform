import { notFound } from 'next/navigation';

/** Any address that matches no page shows the site's "page not found" screen. */
export default function CatchAll() {
  notFound();
}
