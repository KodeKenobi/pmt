"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/contexts/TeamContext";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";
import { onRealtimeChange } from "@/lib/realtime-events";

type Heading = {
  id: string;
  level: number;
  text: string;
};

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

type AuthoredDoc = {
  id: string;
  kind: "authored-doc";
  title: string;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
};

type RepoReadme = {
  id: string;
  kind: "repo-readme";
  title: string;
  summary: string;
  contentHtml: string;
  owner: string;
  repo: string;
  url: string;
  updatedAt: string | null;
  project?: { id: string; name: string } | null;
};

type DocsLibraryResponse = {
  authoredDocs: AuthoredDoc[];
  repoReadmes: RepoReadme[];
};

type LibraryItem = AuthoredDoc | RepoReadme;

function itemSearchText(item: LibraryItem) {
  return [
    item.title,
    item.kind === "repo-readme" ? item.summary : item.author?.name,
    item.project?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function DocsPage() {
  const router = useRouter();
  const { activeTeamId, isAllTeams } = useTeam();
  const docsCacheKey = useMemo(
    () => `docs-library-cache:${isAllTeams ? "all" : (activeTeamId ?? "none")}`,
    [activeTeamId, isAllTeams],
  );
  const [authoredDocs, setAuthoredDocs] = useState<AuthoredDoc[]>([]);
  const [repoReadmes, setRepoReadmes] = useState<RepoReadme[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [createDocError, setCreateDocError] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const articleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentPaneRef = useRef<HTMLElement>(null);
  const isFetchingLibraryRef = useRef(false);
  const hasLoadedLibraryOnceRef = useRef(false);
  const lastLibrarySignatureRef = useRef<string>("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(docsCacheKey);
      if (!raw) {
        lastLibrarySignatureRef.current = "";
        return;
      }

      const parsed = JSON.parse(raw) as DocsLibraryResponse;
      const cachedAuthoredDocs = Array.isArray(parsed.authoredDocs)
        ? parsed.authoredDocs
        : [];
      const cachedRepoReadmes = Array.isArray(parsed.repoReadmes)
        ? parsed.repoReadmes
        : [];

      setAuthoredDocs(cachedAuthoredDocs);
      setRepoReadmes(cachedRepoReadmes);
      lastLibrarySignatureRef.current = JSON.stringify({
        authoredDocs: cachedAuthoredDocs,
        repoReadmes: cachedRepoReadmes,
      });
      setLoading(false);
    } catch (error) {
      console.error("[Docs] Failed to read local cache", error);
      lastLibrarySignatureRef.current = "";
    }
  }, [docsCacheKey]);

  const fetchDocsLibrary = useCallback(async () => {
    if (isFetchingLibraryRef.current) return;

    try {
      isFetchingLibraryRef.current = true;
      if (!hasLoadedLibraryOnceRef.current) {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (activeTeamId && !isAllTeams) {
        params.set("teamId", activeTeamId);
      }

      const response = await fetch(
        `/api/docs/library${params.toString() ? `?${params}` : ""}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Failed to load docs library");
      }

      const data = (await response.json()) as DocsLibraryResponse;
      const nextAuthoredDocs = Array.isArray(data.authoredDocs)
        ? data.authoredDocs
        : [];
      const nextRepoReadmes = Array.isArray(data.repoReadmes)
        ? data.repoReadmes
        : [];
      const nextSignature = JSON.stringify({
        authoredDocs: nextAuthoredDocs,
        repoReadmes: nextRepoReadmes,
      });

      if (nextSignature === lastLibrarySignatureRef.current) {
        return;
      }

      setAuthoredDocs(nextAuthoredDocs);
      setRepoReadmes(nextRepoReadmes);
      lastLibrarySignatureRef.current = nextSignature;

      try {
        window.localStorage.setItem(
          docsCacheKey,
          JSON.stringify({
            authoredDocs: nextAuthoredDocs,
            repoReadmes: nextRepoReadmes,
          }),
        );
      } catch (error) {
        console.error("[Docs] Failed to write local cache", error);
      }
    } catch (error) {
      console.error(error);
    } finally {
      isFetchingLibraryRef.current = false;
      hasLoadedLibraryOnceRef.current = true;
      setLoading(false);
    }
  }, [activeTeamId, docsCacheKey, isAllTeams]);

  useEffect(() => {
    void fetchDocsLibrary();
  }, [fetchDocsLibrary]);

  useEffect(() => {
    const unsubscribe = onRealtimeChange((detail) => {
      if (detail.table !== "Document" && detail.table !== "GithubRepo") return;
      void fetchDocsLibrary();
    });

    return unsubscribe;
  }, [fetchDocsLibrary]);

  const filteredAuthoredDocs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return authoredDocs;
    return authoredDocs.filter((doc) => itemSearchText(doc).includes(query));
  }, [authoredDocs, searchQuery]);

  const filteredRepoReadmes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return repoReadmes;
    return repoReadmes.filter((doc) => itemSearchText(doc).includes(query));
  }, [repoReadmes, searchQuery]);

  const visibleItems = useMemo(
    () => [...filteredAuthoredDocs, ...filteredRepoReadmes],
    [filteredAuthoredDocs, filteredRepoReadmes],
  );

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeTeamId, isAllTeams]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedId("");
      return;
    }

    if (!visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [visibleItems, selectedId]);

  const selectedItem =
    visibleItems.find((item) => item.id === selectedId) ?? null;

  const sidebarItemTitle = (item: LibraryItem) => {
    if (item.kind === "repo-readme") {
      return `${item.repo.replace(/\s+/g, "-").toLowerCase()}-README`;
    }
    return item.title;
  };

  // Extract headings from rendered content and assign stable IDs.
  useEffect(() => {
    if (!selectedItem?.contentHtml) {
      setHeadings([]);
      setActiveHeadingId("");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!contentRef.current) return;

      const nextHeadings: Heading[] = [];
      contentRef.current
        .querySelectorAll("h1, h2, h3, h4")
        .forEach((el, idx) => {
          const level = Number(el.tagName[1]);
          const text = (el.textContent || "").trim();
          const baseId = slugifyHeading(text) || `section-${idx + 1}`;
          const id = `${baseId}-${idx + 1}`;
          el.id = id;
          nextHeadings.push({ id, level, text: text || `Section ${idx + 1}` });
        });

      const docTitle = (selectedItem.title || "").trim().toLowerCase();
      const filteredHeadings = nextHeadings.filter((heading) => {
        if (!heading.text.trim()) return false;
        if (heading.text.trim().toLowerCase() === docTitle) {
          return false;
        }
        return true;
      });

      setHeadings(filteredHeadings);
      setActiveHeadingId(filteredHeadings[0]?.id ?? "");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedItem?.id, selectedItem?.contentHtml, selectedItem?.title]);

  // Track active heading based on page scroll position.
  useEffect(() => {
    if (!headings.length) return;

    const handleScroll = () => {
      if (!contentRef.current || !contentPaneRef.current) return;

      const headingElements = Array.from(
        contentRef.current.querySelectorAll("h1, h2, h3, h4"),
      ).filter((el) => Boolean(el.id));
      if (!headingElements.length) return;

      const paneTop = contentPaneRef.current.getBoundingClientRect().top;
      let currentId = headingElements[0].id;
      for (const el of headingElements) {
        if (el.getBoundingClientRect().top - paneTop <= 140) {
          currentId = el.id;
        } else {
          break;
        }
      }

      setActiveHeadingId(currentId);
    };

    handleScroll();
    const pane = contentPaneRef.current;
    if (!pane) return;
    pane.addEventListener("scroll", handleScroll, { passive: true });
    return () => pane.removeEventListener("scroll", handleScroll);
  }, [headings, selectedItem?.id]);

  const createDoc = async () => {
    const title = newDocTitle.trim();
    if (!title) {
      setCreateDocError("Document title is required.");
      return;
    }

    const teamId = activeTeamId;
    if (isAllTeams || !teamId) {
      setCreateDocError(
        "Please select a specific team first to create a document.",
      );
      return;
    }

    try {
      setCreatingDoc(true);
      setCreateDocError("");
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: `<h1>${title}</h1>`, teamId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to create document.",
        );
      }

      const newDoc = await res.json();
      setShowCreateModal(false);
      setNewDocTitle("");
      router.push(`/docs/${newDoc.id}`);
    } catch (error) {
      setCreateDocError(
        error instanceof Error ? error.message : "Failed to create document.",
      );
    } finally {
      setCreatingDoc(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-7rem)] w-full flex-col overflow-hidden border border-[#E5E7EB] bg-[#F5F5F7] text-[#1A1A1A] dark:border-slate-700 dark:bg-gray-900 dark:text-white">
        <header className="border-b border-[#E5E7EB] bg-white px-5 py-4 dark:border-slate-700 dark:bg-gray-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[280px] flex-1 sm:flex-none sm:w-[360px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search articles"
                  className="w-full border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-4 text-sm text-[#1A1A1A] outline-none transition focus:border-[#3498DB] dark:border-slate-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateDocError("");
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2ECC71]"
              >
                <Plus className="h-4 w-4" />
                New article
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid min-h-0 flex-1 w-full max-w-[1440px] grid-cols-1 gap-6 overflow-hidden px-5 py-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 h-full xl:block">
            <div className="h-full border border-[#E5E7EB] bg-white dark:border-slate-700 dark:bg-gray-800">
              <div className="h-full overflow-y-auto px-2 py-2">
                <details
                  open
                  className="group border-b border-[#E5E7EB] px-2 py-1 last:border-b-0"
                >
                  <summary className="cursor-pointer list-none py-1.5 text-md text-[#1A1A1A] font-bold dark:text-white">
                    Docs
                  </summary>
                  <div className="pb-2 space-y-3">
                    <div>
                      <div className="flex flex-col justify-center">
                        <p className="px-2 py-3 text-[14px] font-semibold uppercase tracking-wide text-[#4A4A4A] border-b border-[#E5E7EB] dark:text-gray-400 dark:border-slate-700">
                          Team Documents
                        </p>
                      </div>
                      {filteredAuthoredDocs.length ? (
                        filteredAuthoredDocs.map((item) => (
                          <button
                            key={`nav-authored-${item.id}`}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`mt-1 flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-sm font-medium cursor-pointer pointer-events-auto ${
                              selectedId === item.id
                                ? "border-brand-600 text-brand-600 dark:text-brand-400"
                                : "border-transparent text-[#4A4A4A] hover:text-[#1A1A1A] dark:text-gray-400 dark:hover:text-gray-200"
                            }`}
                            title={sidebarItemTitle(item)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {sidebarItemTitle(item)}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-current opacity-70" />
                          </button>
                        ))
                      ) : (
                        <p className="mt-1 px-2 py-1 text-xs text-[#4A4A4A] dark:text-gray-400">
                          No team docs.
                        </p>
                      )}
                    </div>

                    {/* Horizontal line */}
                    <div className="border-t border-[#E5E7EB] my-4"></div>

                    <div>
                      <div className="flex flex-col justify-center">
                        <p className="px-2 py-3 text-[14px] font-semibold uppercase tracking-wide text-[#4A4A4A] border-b border-[#E5E7EB] dark:text-gray-400 dark:border-slate-700">
                          Repository READMEs
                        </p>
                      </div>

                      {filteredRepoReadmes.length ? (
                        filteredRepoReadmes.map((item) => (
                          <button
                            key={`nav-readme-${item.id}`}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`mt-1 flex w-full items-center gap-2 border-l-2 px-2 py-1.5 text-left text-sm font-medium cursor-pointer pointer-events-auto ${
                              selectedId === item.id
                                ? "border-brand-600 text-brand-600 dark:text-brand-400"
                                : "border-transparent text-[#4A4A4A] hover:text-[#1A1A1A] dark:text-gray-400 dark:hover:text-gray-200"
                            }`}
                            title={sidebarItemTitle(item)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {sidebarItemTitle(item)}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-current opacity-70" />
                          </button>
                        ))
                      ) : (
                        <p className="mt-1 px-2 py-1 text-xs text-[#4A4A4A] dark:text-gray-400">
                          No repository README docs.
                        </p>
                      )}
                    </div>

                    {headings.length > 0 ? (
                      <ul className="mt-2 border-t border-[#E5E7EB] pt-3 space-y-1.5 text-sm px-2 pb-2 dark:border-slate-700">
                        {headings.map((heading) => (
                          <li key={heading.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!contentRef.current) return;

                                let el = contentRef.current.querySelector(
                                  `#${CSS.escape(heading.id)}`,
                                ) as HTMLElement | null;

                                if (!el) {
                                  const liveHeadings = Array.from(
                                    contentRef.current.querySelectorAll(
                                      "h1, h2, h3, h4",
                                    ),
                                  ) as HTMLHeadingElement[];

                                  liveHeadings.forEach((node, idx) => {
                                    const text = (
                                      node.textContent || ""
                                    ).trim();
                                    const baseId =
                                      slugifyHeading(text) ||
                                      `section-${idx + 1}`;
                                    node.id = `${baseId}-${idx + 1}`;
                                  });

                                  el = contentRef.current.querySelector(
                                    `#${CSS.escape(heading.id)}`,
                                  ) as HTMLElement | null;

                                  if (!el) {
                                    el =
                                      liveHeadings.find(
                                        (node) =>
                                          (node.textContent || "").trim() ===
                                          heading.text,
                                      ) ?? null;
                                  }
                                }

                                if (!el) {
                                  return;
                                }

                                if (!contentPaneRef.current) return;

                                const paneTop =
                                  contentPaneRef.current.getBoundingClientRect()
                                    .top;
                                const offsetTop =
                                  contentPaneRef.current.scrollTop +
                                  (el.getBoundingClientRect().top - paneTop) -
                                  110;
                                const targetTop = Math.max(offsetTop, 0);
                                contentPaneRef.current.scrollTo({
                                  top: targetTop,
                                  behavior: "smooth",
                                });
                              }}
                              style={{
                                marginLeft: `${(heading.level - 1) * 12}px`,
                              }}
                              className={`block w-full text-left py-1.5 px-2 rounded transition-colors cursor-pointer pointer-events-auto ${
                                activeHeadingId === heading.id
                                  ? "text-brand-600 font-semibold bg-brand-600/5 dark:text-brand-400 dark:bg-brand-400/10"
                                  : "text-[#4A4A4A] hover:text-[#1A1A1A] hover:bg-gray-100/50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50"
                              }`}
                            >
                              {heading.text}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {!visibleItems.length ? (
                      <p className="mt-1 px-2 py-1 text-xs text-[#4A4A4A] dark:text-gray-400">
                        No docs found.
                      </p>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          </aside>

          <main
            ref={contentPaneRef}
            className="h-full min-h-0 flex-1 overflow-y-auto pr-1"
          >
            {!loading && selectedItem ? (
              <article
                ref={articleRef}
                id="doc-content"
                className="border border-[#E5E7EB] bg-white p-8 sm:p-12 dark:border-slate-700 dark:bg-gray-800"
              >
                <div className="mb-6 flex flex-col gap-4 border-b border-[#E5E7EB] pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-slate-700">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#4A4A4A] dark:text-gray-400">
                      {selectedItem.kind === "repo-readme"
                        ? "Repository README"
                        : "Team Document"}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-[#1A1A1A] dark:text-white">
                      {selectedItem.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedItem.kind === "authored-doc" ? (
                      <Link
                        href={`/docs/${selectedItem.id}`}
                        className="inline-flex items-center gap-2 border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#F5F5F7] dark:border-slate-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                      >
                        Edit article
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <a
                        href={selectedItem.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#F5F5F7] dark:border-slate-700 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                      >
                        Open repository
                        <ArrowUpRight className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                <section className="mb-6 grid gap-3 rounded-lg border border-[#E5E7EB] bg-[#F5F5F7] p-4 sm:grid-cols-2 dark:border-slate-700 dark:bg-gray-900">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4A4A4A] dark:text-gray-400">
                      Source
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1A1A1A] dark:text-white">
                      {selectedItem.kind === "repo-readme"
                        ? `${selectedItem.owner}/${selectedItem.repo}`
                        : (selectedItem.author?.name ?? "Unknown author")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4A4A4A] dark:text-gray-400">
                      Last updated
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#1A1A1A] dark:text-white">
                      {selectedItem.kind === "repo-readme"
                        ? selectedItem.updatedAt
                          ? new Date(selectedItem.updatedAt).toLocaleString()
                          : "Unknown"
                        : new Date(selectedItem.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </section>

                <div
                  ref={contentRef}
                  className="docs-prose max-w-none text-[15px] leading-7 text-[#1A1A1A] dark:text-gray-100"
                  dangerouslySetInnerHTML={{
                    __html:
                      selectedItem.contentHtml ||
                      "<p>No content available.</p>",
                  }}
                />
              </article>
            ) : loading ? (
              <section className="border border-[#E5E7EB] bg-white p-8 sm:p-12">
                <div className="animate-pulse">
                  <div className="h-3 w-28 bg-[#E5E7EB]" />
                  <div className="mt-4 h-8 w-2/3 max-w-md bg-[#E5E7EB]" />
                  <div className="mt-3 h-4 w-full max-w-2xl bg-[#F5F5F7]" />
                  <div className="mt-2 h-4 w-4/5 max-w-xl bg-[#F5F5F7]" />
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="h-20 bg-[#F5F5F7]" />
                    <div className="h-20 bg-[#F5F5F7]" />
                  </div>
                  <div className="mt-8 h-4 w-full bg-[#F5F5F7]" />
                  <div className="mt-3 h-4 w-11/12 bg-[#F5F5F7]" />
                  <div className="mt-3 h-4 w-3/4 bg-[#F5F5F7]" />
                </div>
              </section>
            ) : !loading ? (
              <EmptyState
                title="No document selected"
                description="Create a team document to start building your library."
                icon={<FileText className="h-6 w-6" aria-hidden="true" />}
                action={
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New article
                  </button>
                }
                className="flex min-h-full flex-col items-center justify-center"
              />
            ) : null}
          </main>
        </div>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (creatingDoc) return;
              setShowCreateModal(false);
            }}
          />

          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-[#1A1F2E]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                New document
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (creatingDoc) return;
                  setShowCreateModal(false);
                }}
                className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-brand-500 dark:border-gray-600 dark:bg-gray-950 dark:text-white"
                  placeholder="Enter document title"
                  autoFocus
                />
              </div>

              {createDocError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {createDocError}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/5"
                  disabled={creatingDoc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void createDoc();
                  }}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                  disabled={creatingDoc}
                >
                  {creatingDoc ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
