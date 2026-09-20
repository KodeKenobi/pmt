"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";
import { ArrowLeft, Save, Trash2, Clock, User } from "lucide-react";
import TipTapEditor from "@/components/TipTapEditor";

interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
}

export default function DocEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<string | undefined>("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchDoc = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
        setTitle(data.title);
        setContent(data.content);
      } else {
        router.push("/docs");
      }
    } catch (e) {
      console.error(e);
    }
  }, [id, router]);

  useEffect(() => {
    void fetchDoc();
  }, [fetchDoc]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/docs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
        await fetchDoc(); // reload metadata
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/docs/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/docs");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!doc) {
    return (
      <DashboardLayout>
        <div className="w-full space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="p-2">
                <SkeletonLine className="w-5 h-5" />
              </div>
              <SkeletonLine className="h-8 w-2/3" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <SkeletonLine className="w-8 h-8" />
              <SkeletonLine className="w-32 h-10" />
            </div>
          </div>
          <SkeletonCard className="h-20" />
          <div className="flex-1 min-h-[500px] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1A1F2E] p-6">
            <SkeletonLine className="h-4 w-full mb-3" />
            <SkeletonLine className="h-4 w-full mb-3" />
            <SkeletonLine className="h-4 w-3/4 mb-3" />
            <SkeletonLine className="h-4 w-full mb-3" />
            <SkeletonLine className="h-4 w-5/6" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => router.push("/docs")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 w-full text-slate-900 dark:text-white"
              placeholder="Document Title"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleSave}
              disabled={
                saving || (title === doc.title && content === doc.content)
              }
              className="inline-flex min-w-[150px] items-center justify-center whitespace-nowrap rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-gray-500 bg-white dark:bg-[#1A1F2E] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span>Author: {doc.author?.name ?? "Unknown author"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>
              Last updated: {new Date(doc.updatedAt).toLocaleString()}
            </span>
          </div>
          {doc.project && (
            <div className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded font-medium">
              Project: {doc.project.name}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-[500px] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1A1F2E] p-6">
          <TipTapEditor
            content={content}
            setContent={(val: string) => setContent(val)}
          />
        </div>
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="Delete document"
          message="Are you sure you want to delete this document?"
          confirmLabel="Delete"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            void handleDelete();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
