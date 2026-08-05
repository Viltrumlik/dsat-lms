// Domain: Academy (classroom)
// Description: The class noticeboard. Staff get a composer at the top; everyone
//   in the class reads the feed and can reply where replies are open.
//
// The same component serves the student and the teacher — what differs is what
// the server lets you do, and the capabilities it publishes say so directly
// rather than being re-derived here from a role string. A student sending a post
// would be refused by the API anyway; not rendering the composer just spares
// them the error.
'use client'

import * as React from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { Megaphone, MessageSquare, Pin, Send, Trash2 } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { cursorFromUrl } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { FileList } from '@/components/homework/FileList'
import type { ClassCapabilities, ClassPost } from '@/types'

function Composer({ classId }: { classId: string }) {
  const t = useI18n().t
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [body, setBody] = React.useState('')
  const [isAnnouncement, setIsAnnouncement] = React.useState(false)

  const create = useMutation({
    mutationFn: () =>
      classesAPI.createPost(classId, {
        body,
        // An announcement pings every enrolled student; an ordinary post does
        // not, so the stream can carry chatter without notifying thirty people.
        kind: isAnnouncement ? 'announcement' : 'post',
      }),
    onSuccess: () => {
      setBody('')
      setIsAnnouncement(false)
      queryClient.invalidateQueries({ queryKey: ['class-stream', classId] })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('classroom.postFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('classroom.composerPlaceholder')}
          aria-label={t('classroom.composerPlaceholder')}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isAnnouncement}
              onChange={(e) => setIsAnnouncement(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t('classroom.notifyClass')}
          </label>
          <Button
            size="sm"
            disabled={body.trim() === ''}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            <Send className="h-4 w-4" /> {t('classroom.post')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Replies({
  classId,
  post,
  capabilities,
}: {
  classId: string
  post: ClassPost
  capabilities: ClassCapabilities
}) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [body, setBody] = React.useState('')
  // A feed of ten posts, each with a reply box and every reply expanded, is a
  // wall. Replies stay behind their count until asked for; a post with none
  // shows just "Reply", which is the only thing you can do with it anyway.
  const [open, setOpen] = React.useState(false)
  const dateLocale = locale === 'uz' ? uzDate : undefined
  const isStaff = capabilities.canModerate

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['class-stream', classId] })

  const reply = useMutation({
    mutationFn: () => classesAPI.reply(classId, post.id, body),
    onSuccess: () => {
      setBody('')
      invalidate()
    },
  })
  const removeReply = useMutation({
    mutationFn: (commentId: string) => classesAPI.removeReply(classId, post.id, commentId),
    onSuccess: invalidate,
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border-t border-border pt-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-4 w-4" />
        {post.comments.length > 0
          ? plural(
              locale,
              post.comments.length,
              t('classroom.replyCountOne', { count: post.comments.length }),
              t('classroom.replyCountOther', { count: post.comments.length })
            )
          : t('classroom.reply')}
      </button>
    )
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {post.comments.map((comment) => (
        <div key={comment.id} className="flex gap-2 text-sm">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {comment.author.fullName} ·{' '}
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </p>
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </div>
          {(comment.author.id === user?.id || isStaff) && (
            <button
              type="button"
              aria-label={t('classroom.removeReply')}
              onClick={() => removeReply.mutate(comment.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {post.allowComments ? (
        <div className="flex gap-2">
          <Textarea
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('classroom.replyPlaceholder')}
            aria-label={t('classroom.replyPlaceholder')}
            className="min-h-0 resize-none py-2"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={body.trim() === ''}
            loading={reply.isPending}
            onClick={() => reply.mutate()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('classroom.repliesClosed')}</p>
      )}
    </div>
  )
}

function PostCard({
  classId,
  post,
  capabilities,
}: {
  classId: string
  post: ClassPost
  capabilities: ClassCapabilities
}) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const dateLocale = locale === 'uz' ? uzDate : undefined
  const isStaff = capabilities.canModerate

  const remove = useMutation({
    mutationFn: () => classesAPI.removePost(classId, post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['class-stream', classId] }),
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{post.author.fullName}</span>
              {post.isPinned && (
                <Badge variant="secondary">
                  <Pin className="h-3 w-3" /> {t('classroom.pinned')}
                </Badge>
              )}
              {post.kind === 'announcement' && (
                <Badge variant="warning">
                  <Megaphone className="h-3 w-3" /> {t('classroom.announcement')}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.createdAt), {
                  addSuffix: true,
                  locale: dateLocale,
                })}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>
          </div>
          {(post.author.id === user?.id || isStaff) && (
            <button
              type="button"
              aria-label={t('classroom.removePost')}
              onClick={() => remove.mutate()}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {post.attachments.length > 0 && <FileList files={post.attachments} />}

        <Replies classId={classId} post={post} capabilities={capabilities} />
      </CardContent>
    </Card>
  )
}

export function ClassStream({
  classId,
  capabilities,
}: {
  classId: string
  capabilities: ClassCapabilities
}) {
  const t = useI18n().t
  const canPost = capabilities.canPost

  const query = useInfiniteQuery({
    queryKey: ['class-stream', classId],
    queryFn: ({ pageParam }) => classesAPI.stream(classId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null),
  })

  const posts = query.data?.pages.flatMap((page) => page.data) ?? []

  return (
    <div className="space-y-4">
      {canPost && <Composer classId={classId} />}

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('classroom.loadFailed')}
          </CardContent>
        </Card>
      )}

      {query.data && posts.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('classroom.empty')}
          </CardContent>
        </Card>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} classId={classId} post={post} capabilities={capabilities} />
      ))}

      {query.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t('classroom.loadMore')}
        </Button>
      )}
    </div>
  )
}
