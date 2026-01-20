# Register RRightclickrr sparse package

# Remove old package first
$packages = Get-AppxPackage | Where-Object { $_.Name -like '*RRightclickrr*' }
foreach ($pkg in $packages) {
    Write-Host "Removing: $($pkg.Name)"
    Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue
}

# Register new version
$manifestPath = 'c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\shell-extension\AppxManifest.xml'
$externalPath = 'c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr'

Write-Host "Registering package..."
Add-AppxPackage -Register $manifestPath -ExternalLocation $externalPath

# Verify
Write-Host "`nInstalled packages:"
Get-AppxPackage | Where-Object { $_.Name -like '*RRightclickrr*' } | Format-Table Name, Version
