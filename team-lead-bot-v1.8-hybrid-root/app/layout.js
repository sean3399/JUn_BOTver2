import "./globals.css";

export const metadata = {
  title: "팀장님 시뮬레이터 V1.8",
  description: "실제 업무 반응 패턴 기반 개인용 의사결정 시뮬레이터",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
