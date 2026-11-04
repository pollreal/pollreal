import { BOARD_PAGE_SIZE, MAX_COMMENT, MAX_POST_BODY, MAX_POST_TITLE } from '../config'
import type { Member } from '../env'
import { type Lang, type Msg, href, msgText, tr } from '../i18n'
import type { CommentRow, PostRow } from '../lib/board'
import { dayText, whenText } from '../lib/time'
import type { PostForm } from '../lib/validate'
import { Errors, loginPath, reportPath } from './common'

// What a hidden item shows instead of its content (the measure itself stays public — 정보통신망법 제44조의2②).
export function hiddenNotice(lang: Lang, status: string, hiddenUntil: number | null): string | null {
  const t = tr(lang)
  if (status === 'temp_hidden') return hiddenUntil ? t.hiddenTemp(dayText(lang, hiddenUntil)) : t.hiddenBlocked
  if (status === 'removed') return t.hiddenRemoved
  return null
}

export function PostList(p: { lang: Lang; posts: PostRow[]; empty: string }) {
  const t = tr(p.lang)
  if (!p.posts.length) return <p class="empty">{p.empty}</p>
  return (
    <ul class="posts">
      {p.posts.map((post) => {
        const hidden = hiddenNotice(p.lang, post.status, post.hidden_until)
        return (
          <li>
            <a href={href(p.lang, `/board/${post.id}`)}>
              <strong class={hidden ? 'muted' : ''}>{hidden ? t.hiddenTitle : post.title}</strong>
              {post.comment_count ? <span class="count"> [{post.comment_count}]</span> : ''}
              <span class="meta">
                {post.nickname} · {whenText(p.lang, post.created_at)}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function BoardPage(p: { lang: Lang; posts: PostRow[]; page: number; total: number; member: Member | null }) {
  const t = tr(p.lang)
  const pages = Math.max(1, Math.ceil(p.total / BOARD_PAGE_SIZE))
  return (
    <>
      <h1>{t.board}</h1>
      <p class="note">{t.boardIntro}</p>
      <p>
        <a class="btn" href={p.member ? href(p.lang, '/board/new') : loginPath(p.lang, href(p.lang, '/board/new'))}>
          {t.write}
        </a>
      </p>
      <PostList lang={p.lang} posts={p.posts} empty={t.noPosts} />
      {pages > 1 && (
        <p class="pager">
          {p.page > 1 && <a href={href(p.lang, `/board?page=${p.page - 1}`)}>{t.prev}</a>}
          <span>
            {p.page} / {pages}
          </span>
          {p.page < pages && <a href={href(p.lang, `/board?page=${p.page + 1}`)}>{t.nextPage}</a>}
        </p>
      )}
    </>
  )
}

export function NewPostPage(p: { lang: Lang; form?: PostForm; errors?: Msg[] }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.writeTitle}</h1>
      <Errors lang={p.lang} errors={p.errors} />
      <form method="post" action={href(p.lang, '/board/new')} class="stack">
        <label>
          {t.title}
          <input name="title" value={p.form?.title ?? ''} maxlength={MAX_POST_TITLE} required />
        </label>
        <label>
          {t.body}
          <textarea name="body" rows={10} maxlength={MAX_POST_BODY} required>
            {p.form?.body ?? ''}
          </textarea>
        </label>
        <p class="note">{t.writeNote}</p>
        <button type="submit">{t.post}</button>
      </form>
    </>
  )
}

export function PostPage(p: { lang: Lang; post: PostRow; comments: CommentRow[]; member: Member | null; flash?: string; error?: Msg }) {
  const t = tr(p.lang)
  const { post } = p
  const hidden = hiddenNotice(p.lang, post.status, post.hidden_until)
  const mine = !!p.member && post.member_id === p.member.id
  const self = href(p.lang, `/board/${post.id}`)
  return (
    <>
      <p class="crumb">
        <a href={href(p.lang, '/board')}>{t.board}</a>
      </p>
      {p.flash && <p class="flash">{p.flash}</p>}
      {hidden ? (
        <>
          <h1 class="muted">{t.hiddenHeading}</h1>
          <p class="warn">{hidden}</p>
        </>
      ) : (
        <>
          <h1>{post.title}</h1>
          <p class="meta">
            {post.nickname} · {whenText(p.lang, post.created_at)}
          </p>
          <div class="body">{post.body}</div>
          <p class="actions">
            <a href={reportPath(p.lang, 'post', post.id)}>{t.report}</a>
            {mine && (
              <form method="post" action={`${self}/delete`} class="inline">
                <button type="submit" class="link">
                  {t.delete}
                </button>
              </form>
            )}
          </p>
        </>
      )}

      <section class="comments">
        <h2>{t.comments(post.comment_count)}</h2>
        <ul>
          {p.comments.map((c) => {
            const ch = hiddenNotice(p.lang, c.status, c.hidden_until)
            return (
              <li>
                <span class="meta">
                  {c.nickname} · {whenText(p.lang, c.created_at)}
                </span>
                {ch ? <p class="muted">{ch}</p> : <div class="body">{c.body}</div>}
                {!ch && (
                  <p class="actions">
                    <a href={reportPath(p.lang, 'comment', c.id)}>{t.report}</a>
                    {p.member && c.member_id === p.member.id && (
                      <form method="post" action={`${self}/comments/${c.id}/delete`} class="inline">
                        <button type="submit" class="link">
                          {t.delete}
                        </button>
                      </form>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        {p.error && <p class="warn">{msgText(p.lang, p.error)}</p>}
        {hidden ? (
          ''
        ) : p.member ? (
          <form method="post" action={`${self}/comments`} class="stack">
            <textarea name="body" rows={3} maxlength={MAX_COMMENT} required placeholder={t.commentPh}></textarea>
            <button type="submit">{t.addComment}</button>
          </form>
        ) : (
          <p>
            <a class="btn ghost" href={loginPath(p.lang, self)}>
              {t.signInToComment}
            </a>
          </p>
        )}
      </section>
    </>
  )
}
