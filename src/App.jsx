import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home as HomeIcon,
  Layers,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  UploadCloud,
  XCircle,
  Zap
} from "lucide-react";

const STORAGE_KEY = "astra.study.v1";
const REVIEW_DAYS = {
  easy: 7,
  medium: 3,
  hard: 1
};

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "upload", label: "Upload Notes", icon: UploadCloud },
  { id: "notes", label: "Study Notes", icon: BookOpen },
  { id: "quiz", label: "Quiz", icon: ClipboardCheck },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard }
];

const EMPTY_STORE = {
  activeTopicId: null,
  topics: [],
  stats: {
    quizzesTaken: 0,
    questionsAnswered: 0,
    correctAnswers: 0
  }
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved ? { ...EMPTY_STORE, ...saved } : EMPTY_STORE;
  } catch {
    return EMPTY_STORE;
  }
}

function usePersistentStore() {
  const [store, setStore] = useState(loadStore);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  return [store, setStore];
}

function getInitialPage() {
  const hash = window.location.hash.replace("#", "");
  return NAV_ITEMS.some((item) => item.id === hash) ? hash : "home";
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function compactFileName(name = "Untitled topic") {
  return name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled topic";
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function daysFromNow(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function getAccuracy(stats) {
  if (!stats.questionsAnswered) {
    return 0;
  }

  return Math.round((stats.correctAnswers / stats.questionsAnswered) * 100);
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function App() {
  const [page, setPageState] = useState(getInitialPage);
  const [store, setStore] = usePersistentStore();
  const [selectedFile, setSelectedFile] = useState(null);
  const [ui, setUi] = useState({
    loading: "",
    error: "",
    notice: ""
  });
  const [quizSession, setQuizSession] = useState({
    index: 0,
    selected: "",
    answered: false,
    answers: [],
    finished: false
  });
  const [flashState, setFlashState] = useState({
    index: 0,
    flipped: false
  });

  useEffect(() => {
    const handleHash = () => setPageState(getInitialPage());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const activeTopic = useMemo(() => {
    return store.topics.find((topic) => topic.id === store.activeTopicId) || store.topics[0] || null;
  }, [store.activeTopicId, store.topics]);

  const dashboard = useMemo(() => {
    const flashcards = store.topics.flatMap((topic) => topic.flashcards || []);
    const weakQuestions = store.topics.flatMap((topic) =>
      (topic.incorrectAnswers || []).map((answer) => ({
        ...answer,
        topicTitle: topic.title
      }))
    );

    return {
      topicsStudied: store.topics.length,
      accuracy: getAccuracy(store.stats),
      weakQuestions,
      flashcardsDue: flashcards.filter((card) => Number(card.nextReview || 0) <= Date.now()).length,
      totalFlashcards: flashcards.length
    };
  }, [store]);

  function setPage(nextPage) {
    window.location.hash = nextPage;
    setPageState(nextPage);
  }

  function setStatus(patch) {
    setUi((current) => ({ ...current, ...patch }));
  }

  function updateActiveTopic(updater) {
    if (!activeTopic) {
      return;
    }

    setStore((current) => ({
      ...current,
      topics: current.topics.map((topic) =>
        topic.id === activeTopic.id
          ? {
              ...topic,
              ...updater(topic),
              updatedAt: Date.now()
            }
          : topic
      )
    }));
  }

  async function handleExtractText() {
    if (!selectedFile) {
      setStatus({ error: "Choose a PDF or image first.", notice: "" });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    setStatus({ loading: "extract", error: "", notice: "" });

    try {
      const payload = await requestJson("/api/extract", {
        method: "POST",
        body: formData
      });

      const topic = {
        id: createId("topic"),
        title: compactFileName(payload.metadata?.filename || selectedFile.name),
        fileName: payload.metadata?.filename || selectedFile.name,
        metadata: payload.metadata,
        extractedText: payload.text,
        notes: null,
        quiz: [],
        incorrectAnswers: [],
        flashcards: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      setStore((current) => ({
        ...current,
        activeTopicId: topic.id,
        topics: [topic, ...current.topics]
      }));
      setStatus({ loading: "", error: "", notice: "Text extracted. Ready for notes." });
    } catch (error) {
      setStatus({ loading: "", error: error.message, notice: "" });
    }
  }

  async function handleGenerateNotes() {
    if (!activeTopic?.extractedText) {
      setStatus({ error: "Upload notes before generating study notes.", notice: "" });
      setPage("upload");
      return;
    }

    setStatus({ loading: "notes", error: "", notice: "" });

    try {
      const payload = await requestJson("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeTopic.extractedText })
      });

      updateActiveTopic(() => ({
        title: payload.notes.title || activeTopic.title,
        notes: payload.notes
      }));
      setStatus({ loading: "", error: "", notice: "Study notes generated." });
      setPage("notes");
    } catch (error) {
      setStatus({ loading: "", error: error.message, notice: "" });
    }
  }

  async function handleGenerateQuiz() {
    if (!activeTopic?.extractedText) {
      setStatus({ error: "Upload notes before generating a quiz.", notice: "" });
      setPage("upload");
      return;
    }

    setStatus({ loading: "quiz", error: "", notice: "" });

    try {
      const payload = await requestJson("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeTopic.extractedText })
      });

      updateActiveTopic(() => ({
        quiz: payload.questions,
        incorrectAnswers: []
      }));
      setQuizSession({
        index: 0,
        selected: "",
        answered: false,
        answers: [],
        finished: false
      });
      setStatus({ loading: "", error: "", notice: "Quiz generated." });
      setPage("quiz");
    } catch (error) {
      setStatus({ loading: "", error: error.message, notice: "" });
    }
  }

  async function handleGenerateFlashcards() {
    if (!activeTopic?.extractedText && !activeTopic?.incorrectAnswers?.length) {
      setStatus({ error: "Upload notes or finish a quiz before creating flashcards.", notice: "" });
      setPage("upload");
      return;
    }

    setStatus({ loading: "flashcards", error: "", notice: "" });

    try {
      const payload = await requestJson("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: activeTopic.extractedText,
          incorrectAnswers: activeTopic.incorrectAnswers || []
        })
      });

      updateActiveTopic((topic) => ({
        flashcards: [...payload.flashcards, ...(topic.flashcards || [])]
      }));
      setFlashState({ index: 0, flipped: false });
      setStatus({ loading: "", error: "", notice: "Flashcards generated." });
      setPage("flashcards");
    } catch (error) {
      setStatus({ loading: "", error: error.message, notice: "" });
    }
  }

  function handleQuizSubmit() {
    const question = activeTopic?.quiz?.[quizSession.index];

    if (!question || !quizSession.selected || quizSession.answered) {
      return;
    }

    const isCorrect = quizSession.selected.trim() === question.correctAnswer.trim();
    const record = {
      question: question.question,
      selectedAnswer: quizSession.selected,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      isCorrect,
      createdAt: Date.now()
    };

    setQuizSession((current) => ({
      ...current,
      answered: true,
      answers: [...current.answers, record]
    }));
  }

  function handleQuizNext() {
    const quiz = activeTopic?.quiz || [];
    const isLastQuestion = quizSession.index >= quiz.length - 1;

    if (!isLastQuestion) {
      setQuizSession((current) => ({
        ...current,
        index: current.index + 1,
        selected: "",
        answered: false
      }));
      return;
    }

    const incorrect = quizSession.answers.filter((answer) => !answer.isCorrect);
    const correctCount = quizSession.answers.filter((answer) => answer.isCorrect).length;

    updateActiveTopic(() => ({
      incorrectAnswers: incorrect
    }));
    setStore((current) => ({
      ...current,
      stats: {
        quizzesTaken: current.stats.quizzesTaken + 1,
        questionsAnswered: current.stats.questionsAnswered + quizSession.answers.length,
        correctAnswers: current.stats.correctAnswers + correctCount
      }
    }));
    setQuizSession((current) => ({
      ...current,
      finished: true
    }));
  }

  function handleReviewFlashcard(cardId, difficulty) {
    const days = REVIEW_DAYS[difficulty];

    updateActiveTopic((topic) => ({
      flashcards: (topic.flashcards || []).map((card) =>
        card.id === cardId
          ? {
              ...card,
              difficulty,
              nextReview: daysFromNow(days)
            }
          : card
      )
    }));

    const total = activeTopic?.flashcards?.length || 0;
    setFlashState((current) => ({
      index: total <= 1 ? 0 : (current.index + 1) % total,
      flipped: false
    }));
  }

  function clearNotice() {
    if (ui.notice || ui.error) {
      setStatus({ notice: "", error: "" });
    }
  }

  const pageProps = {
    activeTopic,
    dashboard,
    flashState,
    handleExtractText,
    handleGenerateFlashcards,
    handleGenerateNotes,
    handleGenerateQuiz,
    handleQuizNext,
    handleQuizSubmit,
    handleReviewFlashcard,
    quizSession,
    selectedFile,
    setFlashState,
    setPage,
    setQuizSession,
    setSelectedFile,
    ui
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(180deg,#09090b_0%,#101014_48%,#09090b_100%)]" />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <button
            className="flex w-fit items-center gap-3 text-left"
            onClick={() => setPage("home")}
            type="button"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-500/20">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-xl font-semibold tracking-normal text-white">Astra</span>
              <span className="block text-sm text-zinc-400">Study system</span>
            </span>
          </button>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;

              return (
                <button
                  className={cx(
                    "flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition",
                    active
                      ? "bg-white text-zinc-950"
                      : "text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  )}
                  key={item.id}
                  onClick={() => {
                    clearNotice();
                    setPage(item.id);
                  }}
                  type="button"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StatusBar ui={ui} />
        {page === "home" && <HomePage {...pageProps} />}
        {page === "upload" && <UploadPage {...pageProps} />}
        {page === "notes" && <NotesPage {...pageProps} />}
        {page === "quiz" && <QuizPage {...pageProps} />}
        {page === "flashcards" && <FlashcardsPage {...pageProps} />}
        {page === "dashboard" && <DashboardPage {...pageProps} />}
      </main>
    </div>
  );
}

function StatusBar({ ui }) {
  if (!ui.error && !ui.notice) {
    return null;
  }

  return (
    <div
      className={cx(
        "mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        ui.error
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      )}
    >
      {ui.error ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{ui.error || ui.notice}</span>
    </div>
  );
}

function HomePage({ activeTopic, dashboard, handleGenerateFlashcards, handleGenerateNotes, handleGenerateQuiz, setPage, ui }) {
  const hasText = Boolean(activeTopic?.extractedText);

  return (
    <div className="grid gap-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-blue-300">Astra</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            A smart system that guides how you study.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
            Upload material, turn it into structured notes, test recall, then review weak spots with timed flashcards.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Topics" value={dashboard.topicsStudied} />
          <Metric label="Accuracy" value={`${dashboard.accuracy}%`} tone="blue" />
          <Metric label="Weak" value={dashboard.weakQuestions.length} tone="rose" />
          <Metric label="Due Cards" value={dashboard.flashcardsDue} tone="emerald" />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <FlowStep icon={UploadCloud} label="Upload" active={hasText} />
        <FlowStep icon={BookOpen} label="Notes" active={Boolean(activeTopic?.notes)} />
        <FlowStep icon={ClipboardCheck} label="Quiz" active={Boolean(activeTopic?.quiz?.length)} />
        <FlowStep icon={Layers} label="Review" active={Boolean(activeTopic?.flashcards?.length)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ActionCard
          icon={UploadCloud}
          label="Start With A File"
          body={activeTopic?.fileName || "PDFs and images become study-ready text."}
          action="Upload"
          onClick={() => setPage("upload")}
        />
        <ActionCard
          disabled={!hasText || ui.loading === "notes"}
          icon={BookOpen}
          label="Shape Study Notes"
          body={activeTopic?.notes?.summary || "Basics, key concepts, and important points."}
          action="Generate Notes"
          loading={ui.loading === "notes"}
          onClick={handleGenerateNotes}
        />
        <ActionCard
          disabled={!hasText || ui.loading === "quiz"}
          icon={Brain}
          label="Test Recall"
          body="One question at a time, with explanations and weak-area tracking."
          action="Generate Quiz"
          loading={ui.loading === "quiz"}
          onClick={handleGenerateQuiz}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <CurrentTopic topic={activeTopic} setPage={setPage} />
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Review engine</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Spaced flashcards</h2>
            </div>
            <CalendarClock className="h-5 w-5 text-blue-300" aria-hidden="true" />
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Cards marked easy return in 7 days, medium in 3 days, and hard tomorrow.
          </p>
          <Button
            className="mt-5 w-full"
            disabled={!hasText || ui.loading === "flashcards"}
            icon={Zap}
            loading={ui.loading === "flashcards"}
            onClick={handleGenerateFlashcards}
          >
            Generate Flashcards
          </Button>
        </Card>
      </section>
    </div>
  );
}

function UploadPage({
  activeTopic,
  handleExtractText,
  handleGenerateNotes,
  selectedFile,
  setSelectedFile,
  ui
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
      <section>
        <PageTitle
          eyebrow="Upload Notes"
          title="Extract clean study text."
          body="PDFs are parsed on the server. Images use OCR before anything is sent to Gemini."
        />
        <Card className="mt-6 p-5">
          <label
            className="flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-5 text-center transition hover:border-blue-300/70 hover:bg-blue-500/[0.08]"
            htmlFor="file-upload"
          >
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-blue-500/15 text-blue-200">
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-white">
                {selectedFile ? selectedFile.name : "Choose PDF or image"}
              </span>
              <span className="mt-1 block text-xs text-zinc-500">Maximum 12MB</span>
            </span>
            <input
              accept="application/pdf,image/*"
              className="sr-only"
              id="file-upload"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              type="file"
            />
          </label>

          <Button
            className="mt-5 w-full"
            disabled={!selectedFile || ui.loading === "extract"}
            icon={FileText}
            loading={ui.loading === "extract"}
            onClick={handleExtractText}
          >
            Extract Text
          </Button>

          <Button
            className="mt-3 w-full"
            disabled={!activeTopic?.extractedText || ui.loading === "notes"}
            icon={Sparkles}
            loading={ui.loading === "notes"}
            onClick={handleGenerateNotes}
            variant="secondary"
          >
            Generate Study Notes
          </Button>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-400">Extracted preview</p>
            <h2 className="text-xl font-semibold text-white">{activeTopic?.title || "No active topic"}</h2>
          </div>
          {activeTopic?.metadata?.pages ? (
            <span className="rounded-full bg-white/[0.08] px-3 py-1 text-xs text-zinc-300">
              {activeTopic.metadata.pages} pages
            </span>
          ) : null}
        </div>
        <Card className="min-h-[480px] p-5">
          {activeTopic?.extractedText ? (
            <textarea
              className="h-[430px] w-full resize-none rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none ring-0 transition focus:border-blue-300/60"
              readOnly
              value={activeTopic.extractedText}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Preview appears here"
              body="Once extraction finishes, Astra keeps the text locally and uses it for notes, quizzes, and cards."
            />
          )}
        </Card>
      </section>
    </div>
  );
}

function NotesPage({ activeTopic, handleGenerateFlashcards, handleGenerateNotes, handleGenerateQuiz, setPage, ui }) {
  if (!activeTopic?.notes) {
    return (
      <EmptyPage
        icon={BookOpen}
        title="No study notes yet"
        body="Generate notes from an uploaded PDF or image."
        action="Go To Upload"
        onClick={() => setPage("upload")}
      />
    );
  }

  const { notes } = activeTopic;

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <PageTitle eyebrow="Study Notes" title={notes.title} body={notes.summary} />
        <div className="flex flex-wrap gap-3">
          <Button
            icon={Sparkles}
            loading={ui.loading === "notes"}
            onClick={handleGenerateNotes}
            variant="secondary"
          >
            Regenerate
          </Button>
          <Button
            icon={Brain}
            loading={ui.loading === "quiz"}
            onClick={handleGenerateQuiz}
          >
            Generate Quiz
          </Button>
          <Button
            icon={Layers}
            loading={ui.loading === "flashcards"}
            onClick={handleGenerateFlashcards}
            variant="secondary"
          >
            Flashcards
          </Button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <NotesSection icon={BookOpen} title="Basics" items={notes.basics} />
        <NotesSection icon={Target} title="Key Concepts" items={notes.keyConcepts} />
        <NotesSection icon={Zap} title="Important Points" items={notes.importantPoints} />
      </section>
    </div>
  );
}

function QuizPage({
  activeTopic,
  handleGenerateQuiz,
  handleQuizNext,
  handleQuizSubmit,
  quizSession,
  setPage,
  setQuizSession,
  ui
}) {
  const quiz = activeTopic?.quiz || [];

  if (!quiz.length) {
    return (
      <EmptyPage
        icon={ClipboardCheck}
        title="No quiz ready"
        body="Generate MCQs from the current topic."
        action={ui.loading === "quiz" ? "Generating" : "Generate Quiz"}
        loading={ui.loading === "quiz"}
        onClick={activeTopic?.extractedText ? handleGenerateQuiz : () => setPage("upload")}
      />
    );
  }

  if (quizSession.finished) {
    const correct = quizSession.answers.filter((answer) => answer.isCorrect).length;
    const incorrect = quizSession.answers.length - correct;
    const accuracy = quizSession.answers.length ? Math.round((correct / quizSession.answers.length) * 100) : 0;

    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <PageTitle eyebrow="Quiz Complete" title={`${accuracy}% accuracy`} body={`${correct} correct and ${incorrect} to review.`} />
        <ProgressBar value={accuracy} />
        <div className="flex flex-wrap gap-3">
          <Button icon={RotateCcw} onClick={handleGenerateQuiz} variant="secondary">
            New Quiz
          </Button>
          <Button icon={Layers} onClick={() => setPage("flashcards")}>
            Review Flashcards
          </Button>
        </div>
        {incorrect ? (
          <section className="grid gap-3">
            {quizSession.answers
              .filter((answer) => !answer.isCorrect)
              .map((answer) => (
                <Card className="p-4" key={answer.question}>
                  <p className="font-medium text-white">{answer.question}</p>
                  <p className="mt-2 text-sm text-zinc-400">Correct: {answer.correctAnswer}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{answer.explanation}</p>
                </Card>
              ))}
          </section>
        ) : null}
      </div>
    );
  }

  const question = quiz[quizSession.index];
  const progress = Math.round(((quizSession.index + 1) / quiz.length) * 100);
  const isCorrect = quizSession.selected === question.correctAnswer;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <section className="flex items-end justify-between gap-4">
        <PageTitle
          eyebrow={`Question ${quizSession.index + 1} of ${quiz.length}`}
          title="Recall check"
          body={activeTopic?.title}
        />
        <div className="min-w-[160px]">
          <ProgressBar value={progress} />
        </div>
      </section>

      <Card className="p-6">
        <h2 className="text-2xl font-semibold leading-snug text-white">{question.question}</h2>
        <div className="mt-6 grid gap-3">
          {question.options.map((option) => {
            const selected = quizSession.selected === option;
            const revealed = quizSession.answered;
            const correctOption = option === question.correctAnswer;

            return (
              <button
                className={cx(
                  "flex min-h-14 items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left text-sm transition",
                  selected && !revealed && "border-blue-300/70 bg-blue-500/[0.12] text-white",
                  !selected && !revealed && "border-white/10 bg-white/[0.035] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]",
                  revealed && correctOption && "border-emerald-300/50 bg-emerald-500/[0.12] text-emerald-50",
                  revealed && selected && !correctOption && "border-rose-300/50 bg-rose-500/[0.12] text-rose-50",
                  revealed && !selected && !correctOption && "border-white/10 bg-white/[0.025] text-zinc-500"
                )}
                disabled={quizSession.answered}
                key={option}
                onClick={() => setQuizSession((current) => ({ ...current, selected: option }))}
                type="button"
              >
                <span>{option}</span>
                {revealed && correctOption ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                {revealed && selected && !correctOption ? <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        {quizSession.answered ? (
          <div
            className={cx(
              "mt-5 rounded-lg border px-4 py-3 text-sm leading-6",
              isCorrect
                ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-300/30 bg-rose-500/10 text-rose-100"
            )}
          >
            <strong>{isCorrect ? "Correct." : "Review this."}</strong> {question.explanation}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          {!quizSession.answered ? (
            <Button disabled={!quizSession.selected} icon={Check} onClick={handleQuizSubmit}>
              Check Answer
            </Button>
          ) : (
            <Button icon={ArrowRight} onClick={handleQuizNext}>
              {quizSession.index === quiz.length - 1 ? "Finish" : "Next"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function FlashcardsPage({
  activeTopic,
  flashState,
  handleGenerateFlashcards,
  handleReviewFlashcard,
  setFlashState,
  setPage,
  ui
}) {
  const cards = useMemo(() => {
    return [...(activeTopic?.flashcards || [])].sort((a, b) => Number(a.nextReview || 0) - Number(b.nextReview || 0));
  }, [activeTopic?.flashcards]);

  if (!cards.length) {
    return (
      <EmptyPage
        icon={Layers}
        title="No flashcards yet"
        body="Create cards from the current topic or missed quiz answers."
        action={ui.loading === "flashcards" ? "Generating" : "Generate Flashcards"}
        loading={ui.loading === "flashcards"}
        onClick={activeTopic?.extractedText ? handleGenerateFlashcards : () => setPage("upload")}
      />
    );
  }

  const currentIndex = flashState.index % cards.length;
  const card = cards[currentIndex];
  const dueNow = cards.filter((item) => Number(item.nextReview || 0) <= Date.now()).length;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageTitle
          eyebrow="Flashcards"
          title={activeTopic?.title || "Review"}
          body={`${dueNow} due now from ${cards.length} saved cards.`}
        />
        <Button
          icon={Sparkles}
          loading={ui.loading === "flashcards"}
          onClick={handleGenerateFlashcards}
          variant="secondary"
        >
          Add Cards
        </Button>
      </section>

      <button
        className={cx("flip-card min-h-[360px] text-left", flashState.flipped && "is-flipped")}
        onClick={() => setFlashState((current) => ({ ...current, flipped: !current.flipped }))}
        type="button"
      >
        <div className="flip-card-inner relative min-h-[360px]">
          <div className="flip-card-face absolute inset-0 rounded-lg border border-white/10 bg-white/[0.055] p-7 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium capitalize text-blue-200">
                {card.difficulty}
              </span>
              <span className="text-xs text-zinc-500">Due {formatDate(card.nextReview)}</span>
            </div>
            <div className="grid min-h-[250px] place-items-center py-8">
              <h2 className="max-w-2xl text-center text-3xl font-semibold leading-tight text-white">
                {card.question}
              </h2>
            </div>
            <p className="text-center text-sm text-zinc-500">Tap to flip</p>
          </div>
          <div className="flip-card-face flip-card-back absolute inset-0 rounded-lg border border-blue-300/20 bg-[#101318] p-7 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
                Answer
              </span>
              <span className="text-xs text-zinc-500">Card {currentIndex + 1} of {cards.length}</span>
            </div>
            <div className="grid min-h-[250px] place-items-center py-8">
              <p className="max-w-2xl text-center text-xl leading-8 text-zinc-100">{card.answer}</p>
            </div>
            <p className="text-center text-sm text-zinc-500">Rate recall</p>
          </div>
        </div>
      </button>

      <section className="grid gap-3 sm:grid-cols-3">
        <ReviewButton
          label="Easy"
          body="+7 days"
          icon={CheckCircle2}
          tone="emerald"
          onClick={() => handleReviewFlashcard(card.id, "easy")}
        />
        <ReviewButton
          label="Medium"
          body="+3 days"
          icon={BarChart3}
          tone="blue"
          onClick={() => handleReviewFlashcard(card.id, "medium")}
        />
        <ReviewButton
          label="Hard"
          body="+1 day"
          icon={AlertCircle}
          tone="rose"
          onClick={() => handleReviewFlashcard(card.id, "hard")}
        />
      </section>
    </div>
  );
}

function DashboardPage({ dashboard, activeTopic, setPage }) {
  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageTitle
          eyebrow="Dashboard"
          title="Study signals"
          body="Astra tracks what you studied, what stuck, and what needs another pass."
        />
        <Button icon={UploadCloud} onClick={() => setPage("upload")}>
          New Topic
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Topics studied" value={dashboard.topicsStudied} />
        <Metric label="Accuracy" value={`${dashboard.accuracy}%`} tone="blue" />
        <Metric label="Weak questions" value={dashboard.weakQuestions.length} tone="rose" />
        <Metric label="Flashcards due" value={dashboard.flashcardsDue} tone="emerald" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Accuracy</p>
              <h2 className="text-xl font-semibold text-white">Recall strength</h2>
            </div>
            <span className="text-2xl font-semibold text-white">{dashboard.accuracy}%</span>
          </div>
          <ProgressBar value={dashboard.accuracy} />
          <div className="mt-6 grid gap-3">
            {dashboard.weakQuestions.slice(0, 5).map((item) => (
              <div className="border-b border-white/10 py-4 last:border-b-0" key={`${item.question}-${item.createdAt}`}>
                <p className="text-sm font-medium text-white">{item.question}</p>
                <p className="mt-2 text-xs text-zinc-500">{item.topicTitle}</p>
              </div>
            ))}
            {!dashboard.weakQuestions.length ? (
              <EmptyState icon={CheckCircle2} title="No weak questions logged" body="Missed quiz answers will collect here." />
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Active topic</p>
              <h2 className="text-xl font-semibold text-white">{activeTopic?.title || "None"}</h2>
            </div>
            <Target className="h-5 w-5 text-blue-300" aria-hidden="true" />
          </div>
          <div className="grid gap-3">
            <Signal label="Text extracted" active={Boolean(activeTopic?.extractedText)} />
            <Signal label="Notes generated" active={Boolean(activeTopic?.notes)} />
            <Signal label="Quiz ready" active={Boolean(activeTopic?.quiz?.length)} />
            <Signal label="Cards saved" active={Boolean(activeTopic?.flashcards?.length)} />
          </div>
        </Card>
      </section>
    </div>
  );
}

function Card({ className, children }) {
  return (
    <div className={cx("rounded-lg border border-white/10 bg-white/[0.055] shadow-soft backdrop-blur", className)}>
      {children}
    </div>
  );
}

function Button({ children, className, disabled, icon: Icon, loading, onClick, variant = "primary" }) {
  return (
    <button
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary"
          ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400"
          : "border border-white/10 bg-white/[0.07] text-white hover:bg-white/[0.12]",
        className
      )}
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

function PageTitle({ eyebrow, title, body }) {
  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-300">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white sm:text-4xl">{title}</h1>
      {body ? <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{body}</p> : null}
    </div>
  );
}

function Metric({ label, value, tone = "zinc" }) {
  const toneClasses = {
    zinc: "text-white",
    blue: "text-blue-200",
    rose: "text-rose-200",
    emerald: "text-emerald-200"
  };

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={cx("mt-3 text-3xl font-semibold", toneClasses[tone])}>{value}</p>
    </Card>
  );
}

function FlowStep({ active, icon: Icon, label }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cx(
              "grid h-9 w-9 place-items-center rounded-lg",
              active ? "bg-blue-500 text-white" : "bg-white/[0.07] text-zinc-500"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
        {active ? <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-zinc-600" aria-hidden="true" />}
      </div>
    </Card>
  );
}

function ActionCard({ action, body, disabled, icon: Icon, label, loading, onClick }) {
  return (
    <Card className="flex min-h-[210px] flex-col justify-between p-5">
      <div>
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-500/15 text-blue-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-white">{label}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
      </div>
      <Button className="mt-5 w-full" disabled={disabled} icon={ArrowRight} loading={loading} onClick={onClick}>
        {action}
      </Button>
    </Card>
  );
}

function CurrentTopic({ topic, setPage }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm text-zinc-400">Current topic</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{topic?.title || "No topic yet"}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            {topic?.extractedText
              ? topic.extractedText.slice(0, 220) + (topic.extractedText.length > 220 ? "..." : "")
              : "Upload a PDF or image to begin."}
          </p>
        </div>
        <Button icon={FileText} onClick={() => setPage(topic?.extractedText ? "upload" : "upload")} variant="secondary">
          Open
        </Button>
      </div>
    </Card>
  );
}

function NotesSection({ icon: Icon, items, title }) {
  return (
    <Card className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08] text-blue-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      </div>
      <ul className="grid gap-3">
        {(items || []).map((item, index) => (
          <li className="flex gap-3 text-sm leading-6 text-zinc-300" key={`${title}-${index}`}>
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReviewButton({ body, icon: Icon, label, onClick, tone }) {
  const tones = {
    emerald: "hover:border-emerald-300/40 hover:bg-emerald-500/10 text-emerald-200",
    blue: "hover:border-blue-300/40 hover:bg-blue-500/10 text-blue-200",
    rose: "hover:border-rose-300/40 hover:bg-rose-500/10 text-rose-200"
  };

  return (
    <button
      className={cx(
        "flex min-h-[86px] items-center gap-4 rounded-lg border border-white/10 bg-white/[0.045] p-4 text-left transition",
        tones[tone]
      )}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.08]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block font-semibold text-white">{label}</span>
        <span className="mt-1 block text-sm text-zinc-500">{body}</span>
      </span>
    </button>
  );
}

function ProgressBar({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-blue-400 transition-all duration-500"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

function Signal({ active, label }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
      <span className="text-sm text-zinc-300">{label}</span>
      {active ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
      ) : (
        <XCircle className="h-4 w-4 text-zinc-600" aria-hidden="true" />
      )}
    </div>
  );
}

function EmptyState({ body, icon: Icon, title }) {
  return (
    <div className="grid min-h-[260px] place-items-center text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white/[0.08] text-blue-200">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
      </div>
    </div>
  );
}

function EmptyPage({ action, body, icon: Icon, loading, onClick, title }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Card className="p-8">
        <EmptyState body={body} icon={Icon} title={title} />
        <Button className="w-full" icon={ArrowRight} loading={loading} onClick={onClick}>
          {action}
        </Button>
      </Card>
    </div>
  );
}
