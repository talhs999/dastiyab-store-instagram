export const metadata = {
  title: "Dastiyab DM Agent",
  description: "Instagram/Facebook DM sales agent for Dastiyab Store",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          background: "#fafafa",
          color: "#111",
        }}
      >
        {children}
      </body>
    </html>
  );
}
