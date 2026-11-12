"use client";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="py-8 text-center">
      <div role="alert" className="rounded-lg border border-red-300 p-8 dark:border-red-800">
        <h1 className="text-xl font-semibold">We couldn’t load the products</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        <button
          onClick={() => retry()}
          className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
