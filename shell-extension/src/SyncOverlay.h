// RRightclickrr shell icon overlay handler

#pragma once

#include <windows.h>
#include <shobjidl.h>

class CSyncOverlayIcon : public IShellIconOverlayIdentifier
{
public:
    CSyncOverlayIcon();

    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void **ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;

    // IShellIconOverlayIdentifier
    IFACEMETHODIMP IsMemberOf(LPCWSTR pwszPath, DWORD dwAttrib) override;
    IFACEMETHODIMP GetOverlayInfo(LPWSTR pwszIconFile, int cchMax, int *pIndex, DWORD *pdwFlags) override;
    IFACEMETHODIMP GetPriority(int *pPriority) override;

private:
    ~CSyncOverlayIcon();

    HRESULT GetSyncedIndexPath(LPWSTR pszPath, DWORD cchPath);
    bool IsPathSynced(LPCWSTR pwszPath);

    long m_cRef;
};

