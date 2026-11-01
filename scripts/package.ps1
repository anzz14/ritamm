$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$rootDir = (Get-Item $PSScriptRoot).Parent.FullName
$zipPath = Join-Path $rootDir "submission.zip"

Write-Host "Creating submission zip: $zipPath"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$itemsToInclude = @(
    "src",
    "tests",
    "scripts",
    "config",
    "pack",
    "output",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vitest.config.ts",
    ".env.example",
    ".gitignore",
    "README.md",
    "ASSUMPTIONS.md",
    "DECISIONS.md",
    "plan.md"
)

$tempFolder = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempFolder | Out-Null

try {
    foreach ($item in $itemsToInclude) {
        $sourcePath = Join-Path $rootDir $item
        if (Test-Path $sourcePath) {
            $destPath = Join-Path $tempFolder $item
            if (Test-Path $sourcePath -PathType Container) {
                Copy-Item -Path $sourcePath -Destination $destPath -Recurse -Force
            } else {
                Copy-Item -Path $sourcePath -Destination $destPath -Force
            }
        }
    }

    # Remove any unwanted nested files from temp folder
    Get-ChildItem -Path $tempFolder -Recurse -Include ".env", "*.cache*", "*.vitest*", "*coverage*" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Compress-Archive -Path "$tempFolder\*" -DestinationPath $zipPath -Force
} finally {
    Remove-Item -Path $tempFolder -Recurse -Force -ErrorAction SilentlyContinue
}

$zipSize = (Get-Item $zipPath).Length
$zipSizeMb = [math]::Round($zipSize / 1MB, 2)
Write-Host "=========================================="
Write-Host "Submission package created: $zipPath"
Write-Host "Size: $zipSize bytes ($zipSizeMb MB)"
Write-Host "=========================================="
