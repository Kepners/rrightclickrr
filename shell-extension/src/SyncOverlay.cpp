// RRightclickrr shell icon overlay handler

#include "SyncOverlay.h"
#include <pathcch.h>
#include <shlwapi.h>
#include <shlobj.h>
#include <strsafe.h>
#include <algorithm>
#include <mutex>
#include <string>
#include <vector>

#pragma comment(lib, "pathcch.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")

extern HMODULE g_hModule;
extern long g_cDllRef;

namespace
{
constexpr ULONGLONG kCacheRefreshIntervalMs = 1500;

std::mutex g_cacheMutex;
std::wstring g_cachedIndexPath;
FILETIME g_cachedWriteTime = {};
ULONGLONG g_lastCacheProbeTick = 0;
std::vector<std::wstring> g_cachedSyncedRoots;

bool FileTimeEqual(const FILETIME &lhs, const FILETIME &rhs)
{
    return lhs.dwLowDateTime == rhs.dwLowDateTime && lhs.dwHighDateTime == rhs.dwHighDateTime;
}

std::wstring NormalizePath(std::wstring value)
{
    std::replace(value.begin(), value.end(), L'/', L'\\');
    for (wchar_t &ch : value)
    {
        ch = static_cast<wchar_t>(towlower(ch));
    }

    while (value.length() > 3 && !value.empty() && value.back() == L'\\')
    {
        value.pop_back();
    }

    return value;
}

bool IsSameOrChildPath(const std::wstring &candidate, const std::wstring &root)
{
    if (candidate == root)
    {
        return true;
    }

    if (candidate.length() <= root.length())
    {
        return false;
    }

    if (candidate.compare(0, root.length(), root) != 0)
    {
        return false;
    }

    // Drive roots like "c:\" should match direct children.
    if (!root.empty() && root.back() == L'\\')
    {
        return true;
    }

    return candidate[root.length()] == L'\\';
}

bool ReadSyncedPathList(const std::wstring &filePath, std::vector<std::wstring> &paths)
{
    HANDLE file = CreateFileW(
        filePath.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);

    if (file == INVALID_HANDLE_VALUE)
    {
        return false;
    }

    LARGE_INTEGER size = {};
    if (!GetFileSizeEx(file, &size))
    {
        CloseHandle(file);
        return false;
    }

    if (size.QuadPart <= 0 || size.QuadPart > 4 * 1024 * 1024)
    {
        CloseHandle(file);
        return true;
    }

    std::string bytes(static_cast<size_t>(size.QuadPart), '\0');
    DWORD read = 0;
    const BOOL ok = ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr);
    CloseHandle(file);

    if (!ok || read == 0)
    {
        return true;
    }

    bytes.resize(read);

    int wideLen = MultiByteToWideChar(CP_UTF8, 0, bytes.data(), static_cast<int>(bytes.size()), nullptr, 0);
    if (wideLen <= 0)
    {
        return false;
    }

    std::wstring content(static_cast<size_t>(wideLen), L'\0');
    if (MultiByteToWideChar(CP_UTF8, 0, bytes.data(), static_cast<int>(bytes.size()), content.data(), wideLen) <= 0)
    {
        return false;
    }

    size_t start = 0;
    while (start < content.length())
    {
        size_t end = content.find(L'\n', start);
        if (end == std::wstring::npos)
        {
            end = content.length();
        }

        std::wstring line = content.substr(start, end - start);
        if (!line.empty() && line.back() == L'\r')
        {
            line.pop_back();
        }

        if (!line.empty())
        {
            paths.push_back(NormalizePath(line));
        }

        if (end == content.length())
        {
            break;
        }
        start = end + 1;
    }

    return true;
}

void RefreshSyncedRootsCache(const std::wstring &indexPath)
{
    std::lock_guard<std::mutex> guard(g_cacheMutex);

    const ULONGLONG now = GetTickCount64();
    const bool recentlyChecked = (now - g_lastCacheProbeTick) < kCacheRefreshIntervalMs;
    const bool sameIndexFile = (g_cachedIndexPath == indexPath);
    if (recentlyChecked && sameIndexFile)
    {
        return;
    }

    g_lastCacheProbeTick = now;

    WIN32_FILE_ATTRIBUTE_DATA attrs = {};
    const bool exists = GetFileAttributesExW(indexPath.c_str(), GetFileExInfoStandard, &attrs) != 0;
    if (!exists)
    {
        g_cachedIndexPath = indexPath;
        g_cachedSyncedRoots.clear();
        g_cachedWriteTime = {};
        return;
    }

    const bool fileChanged = !sameIndexFile || !FileTimeEqual(attrs.ftLastWriteTime, g_cachedWriteTime);
    if (!fileChanged)
    {
        return;
    }

    std::vector<std::wstring> loaded;
    if (ReadSyncedPathList(indexPath, loaded))
    {
        g_cachedSyncedRoots = std::move(loaded);
        g_cachedWriteTime = attrs.ftLastWriteTime;
        g_cachedIndexPath = indexPath;
    }
    else
    {
        g_cachedIndexPath = indexPath;
        g_cachedSyncedRoots.clear();
        g_cachedWriteTime = {};
    }
}
} // namespace

CSyncOverlayIcon::CSyncOverlayIcon() : m_cRef(1)
{
    InterlockedIncrement(&g_cDllRef);
}

CSyncOverlayIcon::~CSyncOverlayIcon()
{
    InterlockedDecrement(&g_cDllRef);
}

IFACEMETHODIMP CSyncOverlayIcon::QueryInterface(REFIID riid, void **ppv)
{
    static const QITAB qit[] = {
        QITABENT(CSyncOverlayIcon, IShellIconOverlayIdentifier),
        {0},
    };
    return QISearch(this, qit, riid, ppv);
}

IFACEMETHODIMP_(ULONG) CSyncOverlayIcon::AddRef()
{
    return InterlockedIncrement(&m_cRef);
}

IFACEMETHODIMP_(ULONG) CSyncOverlayIcon::Release()
{
    const long cRef = InterlockedDecrement(&m_cRef);
    if (cRef == 0)
    {
        delete this;
    }
    return cRef;
}

IFACEMETHODIMP CSyncOverlayIcon::IsMemberOf(LPCWSTR pwszPath, DWORD dwAttrib)
{
    UNREFERENCED_PARAMETER(dwAttrib);

    if (!pwszPath || !*pwszPath)
    {
        return S_FALSE;
    }

    return IsPathSynced(pwszPath) ? S_OK : S_FALSE;
}

IFACEMETHODIMP CSyncOverlayIcon::GetOverlayInfo(LPWSTR pwszIconFile, int cchMax, int *pIndex, DWORD *pdwFlags)
{
    if (!pwszIconFile || cchMax <= 0 || !pIndex || !pdwFlags)
    {
        return E_INVALIDARG;
    }

    WCHAR szDllPath[MAX_PATH];
    if (GetModuleFileNameW(g_hModule, szDllPath, ARRAYSIZE(szDllPath)) == 0)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    HRESULT hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
    {
        return hr;
    }

    hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
    {
        return hr;
    }

    WCHAR szIconPath[MAX_PATH];
    hr = PathCchCombine(szIconPath, ARRAYSIZE(szIconPath), szDllPath, L"resources\\assets\\sync-icon.ico");
    if (FAILED(hr))
    {
        return hr;
    }

    hr = StringCchCopyW(pwszIconFile, static_cast<size_t>(cchMax), szIconPath);
    if (FAILED(hr))
    {
        return hr;
    }

    *pIndex = 0;
    *pdwFlags = ISIOI_ICONFILE | ISIOI_ICONINDEX;
    return S_OK;
}

IFACEMETHODIMP CSyncOverlayIcon::GetPriority(int *pPriority)
{
    if (!pPriority)
    {
        return E_INVALIDARG;
    }

    *pPriority = 0;
    return S_OK;
}

HRESULT CSyncOverlayIcon::GetSyncedIndexPath(LPWSTR pszPath, DWORD cchPath)
{
    if (!pszPath || cchPath == 0)
    {
        return E_INVALIDARG;
    }

    PWSTR localAppData = nullptr;
    const HRESULT hr = SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DEFAULT, nullptr, &localAppData);
    if (FAILED(hr))
    {
        return hr;
    }

    HRESULT combineHr = PathCchCombine(pszPath, cchPath, localAppData, L"RRightclickrr\\synced-paths.txt");
    CoTaskMemFree(localAppData);
    return combineHr;
}

bool CSyncOverlayIcon::IsPathSynced(LPCWSTR pwszPath)
{
    WCHAR szIndexPath[MAX_PATH];
    if (FAILED(GetSyncedIndexPath(szIndexPath, ARRAYSIZE(szIndexPath))))
    {
        return false;
    }

    const std::wstring normalizedTarget = NormalizePath(std::wstring(pwszPath));
    RefreshSyncedRootsCache(szIndexPath);

    std::lock_guard<std::mutex> guard(g_cacheMutex);
    for (const std::wstring &syncedRoot : g_cachedSyncedRoots)
    {
        if (IsSameOrChildPath(normalizedTarget, syncedRoot))
        {
            return true;
        }
    }

    return false;
}

