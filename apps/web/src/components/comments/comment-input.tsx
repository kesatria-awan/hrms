import { useState, useRef, useEffect, useMemo } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Button } from "@tracky/web/components/ui/button"
import { Textarea } from "@tracky/web/components/ui/textarea"
import { useCreateComment } from "@tracky/web/hooks/use-comments"

export interface WorkspaceMember {
  userId: string
  firstName?: string | null
  lastName?: string | null
  email: string
  imageUrl?: string | null
}

interface CommentInputProps {
  taskId: string
  workspaceMembers?: WorkspaceMember[]
}

const MAX_COMMENT_LENGTH = 10000

export function CommentInput({ taskId, workspaceMembers = [] }: CommentInputProps) {
  const [content, setContent] = useState("")
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionListRef = useRef<HTMLDivElement>(null)
  const createCommentMutation = useCreateComment()

  // Filter members based on mention query
  const filteredMembers = workspaceMembers.filter((member) => {
    const query = mentionQuery.toLowerCase()
    const fullName = `${member.firstName || ""} ${member.lastName || ""}`.trim().toLowerCase()
    const email = member.email.toLowerCase()
    const userId = member.userId.toLowerCase()
    return fullName.includes(query) || email.includes(query) || userId.includes(query)
  })

  const handleSubmit = () => {
    if (!content.trim() || content.length > MAX_COMMENT_LENGTH) return

    createCommentMutation.mutate(
      { taskId, content: content.trim() },
      {
        onSuccess: () => {
          setContent("")
          setShowMentions(false)
        },
        onError: (error) => {
          toast.error("Failed to post comment", {
            description: error instanceof Error ? error.message : "Please try again",
          })
        },
      }
    )
  }

  const insertMention = (member: WorkspaceMember) => {
    if (mentionStartPos === null || !textareaRef.current) return

    const cursorPos = textareaRef.current.selectionStart
    const before = content.slice(0, mentionStartPos)
    const after = content.slice(cursorPos)
    // Insert @userId directly - backend will parse this
    const mention = `@${member.userId} `
    const newContent = before + mention + after
    const newCursorPos = mentionStartPos + mention.length

    setContent(newContent)
    setShowMentions(false)
    setMentionQuery("")
    setMentionStartPos(null)
    setMentionIndex(0)

    // Focus and set cursor position after the mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const cursorPos = e.target.selectionStart
    setContent(newContent)

    // Check for @ mention trigger
    const textBeforeCursor = newContent.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf("@")

    if (lastAtIndex !== -1) {
      // Check if the @ is at start or preceded by whitespace
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " "
      if (charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
        // Check if there's no space after @ (still typing mention)
        if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
          setShowMentions(true)
          setMentionQuery(textAfterAt)
          setMentionStartPos(lastAtIndex)
          setMentionIndex(0)
          return
        }
      }
    }

    setShowMentions(false)
    setMentionQuery("")
    setMentionStartPos(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setMentionIndex((prev) => Math.min(prev + 1, filteredMembers.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setMentionIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (filteredMembers[mentionIndex]) {
          insertMention(filteredMembers[mentionIndex])
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        setShowMentions(false)
      }
      return
    }

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Scroll selected mention into view
  useEffect(() => {
    if (showMentions && mentionListRef.current) {
      const selectedEl = mentionListRef.current.children[mentionIndex] as HTMLElement
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" })
      }
    }
  }, [mentionIndex, showMentions])

  const getInitials = (member: WorkspaceMember) => {
    if (member.firstName && member.lastName) {
      return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase()
    }
    if (member.firstName) {
      return member.firstName[0].toUpperCase()
    }
    return member.email?.[0]?.toUpperCase() || "?"
  }

  const isOverLimit = content.length > MAX_COMMENT_LENGTH
  const canSubmit = content.trim().length > 0 && !isOverLimit && !createCommentMutation.isPending

  // Detect platform for keyboard shortcut hint
  const isMac = useMemo(
    () => typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    []
  )
  const shortcutKey = isMac ? "Cmd" : "Ctrl"

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder="Add a comment... (type @ to mention)"
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={3}
          className="resize-none pr-12"
          disabled={createCommentMutation.isPending}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          className="absolute bottom-2 right-2"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {createCommentMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>

        {/* Mentions dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div
            ref={mentionListRef}
            className="absolute left-0 right-0 bottom-full mb-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md z-50"
          >
            {filteredMembers.map((member, index) => (
              <button
                key={member.userId}
                type="button"
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
                  index === mentionIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={() => insertMention(member)}
                onMouseEnter={() => setMentionIndex(index)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src={member.imageUrl || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(member)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start min-w-0">
                  <span className="font-medium truncate">
                    {member.firstName || member.email.split("@")[0]}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {showMentions && filteredMembers.length === 0 && mentionQuery && (
          <div className="absolute left-0 right-0 bottom-full mb-1 rounded-md border bg-popover p-3 shadow-md z-50">
            <p className="text-sm text-muted-foreground text-center">No members found</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Press {shortcutKey}+Enter to submit</span>
        <span className={isOverLimit ? "text-destructive" : ""}>
          {content.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
        </span>
      </div>
    </div>
  )
}
