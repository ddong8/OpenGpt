import { Breadcrumb } from '@/components/Breadcrumb'
import Layout from '@/components/Layout'
import LoadingDots from '@/components/LoadingDots'
import { useGenerateResult } from '@/hooks/useGenerateResult'
import { appRouter } from '@/server/api/root'
import { prisma } from '@/server/db'
import { api } from '@/utils/api'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import Head from 'next/head'
import { useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

type AppConfig = {
  id: string
  name: string
  description: string
  icon: string
  demoInput: string
  hint: string
}
type PageProps = { appConfig: AppConfig }
export const getServerSideProps: GetServerSideProps<
  PageProps,
  { id: string }
> = async ({ params }) => {
  const id = params?.id

  if (!id) {
    return { notFound: true } as any
  }

  const caller = appRouter.createCaller({ prisma, session: null })
  const appConfig = await caller.app.getById(id)

  if (!appConfig) {
    return { notFound: true } as any
  }
  return {
    props: {
      appConfig,
    },
  }
}

const parseMarkdown = (text, streaming = false) => {
  text = text.trim()
  let cursorAdded = false
  // workaround for incomplete code, closing the block if it's not closed
  // First, count occurrences of "```" in the text
  const codeBlockCount = (text.match(/```/g) || []).length
  // If the count is odd and the text doesn't end with "```", add a closing block
  if (codeBlockCount % 2 === 1 && !text.endsWith('```')) {
    if (streaming) {
      text += '█\n```'
      cursorAdded = true
    } else {
      text += '\n```'
    }
  }
  if (codeBlockCount) {
    // make sure the last "```" is on a newline
    text = text.replace(/```$/, '\n```')
  }
  if (streaming && !cursorAdded) {
    text += '█'
  }

  // convert to markdown
  let parsed = marked.parse(text)
  // format Bing's source links more nicely
  // 1. replace "[^1^]" with "[1]" (during progress streams)
  parsed = parsed.replace(/\[\^(\d+)\^]/g, '<strong>[$1]</strong>')
  // 2. replace "^1^" with "[1]" (after the progress stream is done)
  parsed = parsed.replace(/\^(\d+)\^/g, '<strong>[$1]</strong>')

  return DOMPurify.sanitize(parsed)
}

const OpenGptApp = (
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  const { id, demoInput, description, icon, name } = props.appConfig
  const [loading, setLoading] = useState(false)
  const [userInput, setUserInput] = useState(demoInput)
  const { generate, generatedResults } = useGenerateResult()

  const incUsage = api.app.incUsage.useMutation()

  const resultRef = useRef<null | HTMLDivElement>(null)

  const scrollToResults = () => {
    if (resultRef.current !== null) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleRun = async (e: any) => {
    if (loading) {
      return
    }
    setLoading(true)

    e.preventDefault()
    await generate({ userInput, id })
    incUsage.mutate(id)

    scrollToResults()
    setLoading(false)
  }

  return (
    <Layout>
      <Breadcrumb pages={[]} />

      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-2">
        <Head>
          <title>{name}</title>
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <main className="mt-12 flex w-full flex-1 flex-col items-center justify-center px-4 text-center sm:mt-20">
          <h1 className="max-w-[708px] text-4xl font-bold text-slate-900 sm:text-6xl">
            {name}
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-600">{description}</p>

          <div className="w-full max-w-xl">
            {/* <div className="mt-10 flex items-center space-x-3">
            <p className="text-left font-medium">{hint}</p>
          </div> */}

            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              rows={4}
              className="my-5 w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black"
              placeholder={demoInput}
            />

            <button
              className="mt-8 rounded-xl bg-black px-8 py-2 font-medium text-white hover:bg-black/80 sm:mt-10"
              onClick={(e) => handleRun(e)}
              disabled={loading}
            >
              {loading ? <LoadingDots color="white" style="large" /> : '运行'}
            </button>

            <div className="my-10 w-full space-y-10">
              <div
                dangerouslySetInnerHTML={{
                  __html: generatedResults && parseMarkdown(generatedResults),
                }}
              ></div>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  )
}

export default OpenGptApp
