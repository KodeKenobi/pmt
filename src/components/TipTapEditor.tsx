import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  FileText,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonLine } from "@/components/ui/Skeleton";

interface TipTapEditorProps {
  content: string | undefined;
  setContent: (content: string) => void;
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({ content, setContent }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class:
            "text-brand-600 dark:text-brand-400 hover:underline cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class:
            "rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm max-w-full my-4",
        },
      }),
      Underline,
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-6 text-slate-800 dark:text-slate-200",
        spellcheck: "false",
      },
    },
  });

  // Sync external content changes (e.g., after fetch)
  useEffect(() => {
    if (editor && content !== undefined && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const addLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter link URL:", previousUrl);

    // cancelled
    if (url === null) return;

    // empty url
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    if (!editor) return;
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900 rounded-xl h-60">
        <div className="w-full max-w-md space-y-3">
          <FileText className="w-10 h-10 text-gray-400" />
          <SkeletonLine className="h-4 w-40" />
          <SkeletonLine className="h-3 w-full" />
          <SkeletonLine className="h-3 w-4/5" />
        </div>
      </div>
    );
  }

  const ToolbarButton = ({
    onClick,
    isActive = false,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/80 text-gray-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white transition-all duration-150 cursor-pointer flex items-center justify-center",
        isActive &&
          "bg-brand-50 text-brand-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/15",
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1A1F2E] shadow-sm">
      {/* Editor Rich Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50/80 dark:bg-[#1A1F2E] border-b border-gray-200 dark:border-gray-800 backdrop-blur-sm">
        {/* Headings */}
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          isActive={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          isActive={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1" />

        {/* Text styling */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1" />

        {/* Lists & Blocks */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1" />

        {/* Links & Images */}
        <ToolbarButton
          onClick={addLink}
          isActive={editor.isActive("link")}
          title="Insert Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove Link"
          >
            <Unlink className="w-4 h-4" />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={addImage} title="Insert Image URL">
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-auto" />

        {/* History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor Content Area */}
      <div className="bg-white dark:bg-[#1A1F2E]/40">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default TipTapEditor;
