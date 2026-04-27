/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "market-atlas";
const githubPagesBasePath = `/${repositoryName}`;

const nextConfig = {
  ...(isGithubPages
    ? {
        output: "export",
        basePath: githubPagesBasePath,
        assetPrefix: `${githubPagesBasePath}/`,
        trailingSlash: true,
        images: {
          unoptimized: true
        },
        env: {
          NEXT_PUBLIC_BASE_PATH: githubPagesBasePath,
          NEXT_PUBLIC_STATIC_EXPORT: "true"
        }
      }
    : {})
};

export default nextConfig;
