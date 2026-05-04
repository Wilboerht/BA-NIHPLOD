import React from "react";
import { cn } from "@/lib/utils";

// Unique suffix for SVG gradient IDs to avoid conflicts when multiple icons are rendered
const idSuffix = "orbital-icons";

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "洁面": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="17.9922" y="5" width="11.9999" height="37.9997" rx="1.99992" fill={`url(#paint0_linear_2088_4549_${idSuffix})`} />
        <path d="M18.7941 5.99999C18.7941 5.99999 18.9941 5 23.9941 5C28.9941 5 29.1941 5.99999 29.1941 5.99999L29.4941 16.9999C29.994 16.9999 29.994 17.6666 29.994 17.9999V20.9999C30.494 21.0202 30.494 21.6665 30.494 21.9999V40.9997C30.494 42.1043 29.6006 42.9997 28.496 42.9997H23.9941H19.4922C18.3876 42.9997 17.4941 42.1051 17.4941 41.0005V21.9999C17.4941 21.1999 17.6608 20.9999 17.9941 20.9999V17.9999C17.9941 17.1999 18.1608 16.9999 18.4941 16.9999L18.7941 5.99999Z" stroke="#B795A7" strokeWidth="1.59993" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.4062 16.9989C20.4062 16.9989 21.303 16.7988 23.9932 16.7988C26.6833 16.7988 27.5801 16.9989 27.5801 16.9989" stroke="#B795A7" strokeWidth="1.19995" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19.7441 21.099C19.7441 21.099 20.806 20.999 23.9916 20.999C27.1772 20.999 28.239 21.099 28.239 21.099" stroke="#B795A7" strokeWidth="1.19995" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id={`paint0_linear_2088_4549_${idSuffix}`} x1="29.9921" y1="23.9999" x2="17.9922" y2="23.9999" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EAE0E5" />
            <stop offset="0.15" stopColor="#FAF8F9" />
            <stop offset="0.45" stopColor="#CBB3C0" />
            <stop offset="0.55" stopColor="#CBB3C0" />
            <stop offset="0.85" stopColor="#FAF8F9" />
            <stop offset="1" stopColor="#EAE0E5" />
          </linearGradient>
        </defs>
      </svg>
  ),
  "面霜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7.59979" y="10.5986" width="32.7998" height="28.1998" fill={`url(#paint0_linear_2121_4309_${idSuffix})`} />
        <path d="M9.42296 10.5499C11.6962 10.2844 15.9983 10 23.9981 10C31.9979 10 36.3 10.2844 38.5732 10.5499C40.0781 10.7256 40.998 11.957 40.998 13.4721V35.9998C40.998 37.6566 39.6548 38.9998 37.998 38.9998H9.99825C8.34139 38.9998 6.99823 37.6566 6.99823 35.9998V13.4721C6.99823 11.957 7.91808 10.7256 9.42296 10.5499Z" stroke="#D6C0AD" strokeWidth="1.60001" />
        <path d="M10 20.5C10 20.5 13.7333 20 23.9999 20C34.2665 20 37.9998 20.5 37.9998 20.5" stroke="#D6C0AD" strokeWidth="1.20001" strokeLinecap="round" />
        <defs>
          <linearGradient id={`paint0_linear_2121_4309_${idSuffix}`} x1="40.3995" y1="24.6985" x2="7.59979" y2="24.6985" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FBF7F4" />
            <stop offset="0.1" stopColor="white" />
            <stop offset="0.48" stopColor="#EAD9C9" />
            <stop offset="0.52" stopColor="#EAD9C9" />
            <stop offset="0.9" stopColor="white" />
            <stop offset="1" stopColor="#FBF7F4" />
          </linearGradient>
        </defs>
      </svg>
  ),
  "精华露": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="21.0004" y="4.00098" width="6" height="12" fill={`url(#paint0_linear_2088_4438_${idSuffix})`} />
        <rect x="19.8009" y="15.999" width="8.4" height="28" fill={`url(#paint1_radial_2088_4438_${idSuffix})`} />
        <path d="M21.9999 15.999L19.6837 16.7711C19.2754 16.9072 18.9999 17.2893 18.9999 17.7198V42.3991C18.9999 43.2827 19.7163 43.999 20.5999 43.999H27.4C28.2836 43.999 28.9999 43.2827 28.9999 42.3991V17.7198C28.9999 17.2893 28.7245 16.9072 28.3162 16.7711L25.9999 15.999" stroke="#C2B781" strokeWidth="1.59995" strokeLinecap="round" />
        <path d="M20.4963 4.55879C20.4963 4.15877 20.737 3.80191 21.1253 3.70603C21.6952 3.56535 22.6522 3.39941 23.9963 3.39941C25.3405 3.39941 26.2975 3.56535 26.8674 3.70603C27.2557 3.80191 27.4963 4.15877 27.4963 4.55879V14.8994C27.4963 15.4517 27.0489 15.8994 26.4967 15.8994C25.7605 15.8994 24.7591 15.8994 23.9963 15.8994C23.2336 15.8994 22.2322 15.8994 21.496 15.8994C20.9437 15.8994 20.4963 15.4517 20.4963 14.8994V4.55879Z" stroke="#A19F95" strokeWidth="1.39995" />
        <path d="M20.9964 18H26.997" stroke="#C2B781" strokeWidth="1.19996" strokeLinecap="round" />
        <defs>
          <linearGradient id={`paint0_linear_2088_4438_${idSuffix}`} x1="27.0004" y1="10.001" x2="21.0004" y2="10.001" gradientUnits="userSpaceOnUse">
            <stop offset="0.1" stopColor="#E4E4E1" />
            <stop offset="0.2" stopColor="#EBEBE9" />
            <stop offset="0.45" stopColor="#BCBBB4" />
            <stop offset="0.55" stopColor="#BCBBB4" />
            <stop offset="0.8" stopColor="#EBEBE9" />
            <stop offset="0.9" stopColor="#E4E4E1" />
          </linearGradient>
          <radialGradient id={`paint1_radial_2088_4438_${idSuffix}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(24.0009 39.999) rotate(-90) scale(23 5.28392)">
            <stop stopColor="#EDE29D" />
            <stop offset="0.9" stopColor="#FEFDF6" />
            <stop offset="1" stopColor="#FAF7E2" />
          </radialGradient>
        </defs>
      </svg>
  ),
  "面膜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="11.793" y="5.7998" width="24.3998" height="36.3997" fill={`url(#paint0_radial_2123_4611_${idSuffix})`} />
        <path d="M10.9941 6.99992C10.9941 5.89539 11.8895 5 12.9941 5H34.994C36.0986 5 36.9939 5.89539 36.9939 6.99992V9.32388C36.9939 9.72122 36.7235 10.0676 36.3381 10.1639C35.9882 10.2514 35.9882 10.7485 36.3381 10.836C36.7235 10.9324 36.9939 11.2787 36.9939 11.676V40.9998C36.9939 42.1043 36.0986 42.9997 34.994 42.9997H12.9941C11.8895 42.9997 10.9941 42.1043 10.9941 40.9998V11.5933C10.9941 11.2389 11.2209 10.9244 11.557 10.8123C11.8572 10.7123 11.8572 10.2877 11.557 10.1876C11.2209 10.0755 10.9941 9.76097 10.9941 9.40665V6.99992Z" stroke="#D2C9BC" strokeWidth="1.59993" />
        <path d="M13.9941 8.79997C13.9941 8.35816 14.3523 8.00001 14.7941 8.00001H33.194C33.6358 8.00001 33.994 8.35817 33.994 8.79997V38.1998C33.994 38.6416 33.6358 38.9998 33.194 38.9998H14.7941C14.3523 38.9998 13.9941 38.6416 13.9941 38.1998V8.79997Z" stroke="#D2C9BC" strokeWidth="1.19995" strokeLinejoin="round" />
        <defs>
          <radialGradient id={`paint0_radial_2123_4611_${idSuffix}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(23.9929 23.9997) rotate(-180) scale(15.8599 21.8428)">
            <stop offset="0.384615" stopColor="white" />
            <stop offset="0.9" stopColor="#EBE7E4" />
          </radialGradient>
        </defs>
      </svg>
  ),
  "护手霜": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18.9868" y="6.97559" width="9.99979" height="1.92479" fill="white" />
        <mask id={`mask0_2121_4240_${idSuffix}`} maskUnits="userSpaceOnUse" x="18" y="6" width="12" height="37">
          <path d="M28.9885 6.97559H18.9885C18.7676 6.97559 18.5885 7.15466 18.5885 7.37557V8.77557L19.4885 9.67557C20.3393 10.5263 20.3858 34.6985 20.3884 37.3415C20.3885 37.493 20.4741 37.6181 20.6096 37.6859L21.9674 38.3648C22.1029 38.4325 22.1885 38.571 22.1885 38.7225V39.8753C22.1885 40.0962 22.0094 40.2753 21.7885 40.2753H21.6885C21.4676 40.2753 21.2885 40.4544 21.2885 40.6753V41.6753C21.2885 41.8962 21.4676 42.0753 21.6885 42.0753H26.2885C26.5094 42.0753 26.6885 41.8962 26.6885 41.6753V40.6753C26.6885 40.4544 26.5094 40.2753 26.2885 40.2753H26.1885C25.9676 40.2753 25.7885 40.0962 25.7885 39.8753V38.7225C25.7885 38.571 25.8741 38.4325 26.0096 38.3648L27.3674 37.6859C27.5029 37.6181 27.5885 37.493 27.5886 37.3415C27.5912 34.6985 27.6377 10.5263 28.4885 9.67557L29.0546 9.10943C29.2294 8.93466 29.3884 8.55057 29.3884 8.30341V7.37557C29.3884 7.15466 29.2094 6.97559 28.9885 6.97559Z" fill="#D9D9D9" />
        </mask>
        <g mask={`url(#mask0_2121_4240_${idSuffix})`}>
          <rect x="18.987" y="8.90137" width="9.99993" height="32.577" fill={`url(#paint0_linear_2121_4240_${idSuffix})`} />
        </g>
        <path d="M28.9883 6.97559H18.9883C18.7674 6.97559 18.5883 7.15466 18.5883 7.37557V8.77557L19.4883 9.67557C20.3391 10.5263 20.3856 34.6985 20.3882 37.3415C20.3883 37.493 20.4739 37.6182 20.6094 37.6859L21.9672 38.3648C22.1027 38.4326 22.1883 38.5711 22.1883 38.7226V39.8753C22.1883 40.0963 22.0092 40.2753 21.7883 40.2753H21.6883C21.4674 40.2753 21.2883 40.4544 21.2883 40.6753V41.6753C21.2883 41.8962 21.4674 42.0753 21.6883 42.0753H26.2883C26.5092 42.0753 26.6883 41.8962 26.6883 41.6753V40.6753C26.6883 40.4544 26.5092 40.2753 26.2883 40.2753H26.1882C25.9673 40.2753 25.7883 40.0963 25.7883 39.8753V38.7226C25.7883 38.571 25.8739 38.4326 26.0094 38.3648L27.3671 37.6859C27.5027 37.6182 27.5883 37.493 27.5884 37.3415C27.5909 34.6985 27.6375 10.5263 28.4882 9.67557L29.0544 9.10943C29.2292 8.93466 29.3882 8.55057 29.3882 8.30341V7.37557C29.3882 7.15466 29.2092 6.97559 28.9883 6.97559Z" stroke="#B79C8E" strokeWidth="1.39994" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.7289 8.97656H27.2467" stroke="#B79C8E" strokeWidth="0.999959" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22.1254 37.0664L25.8502 37.0664" stroke="#B79C8E" strokeWidth="0.999959" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.5197 40.2588L24.451 40.2588" stroke="#B79C8E" strokeWidth="0.999959" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id={`paint0_linear_2121_4240_${idSuffix}`} x1="28.9869" y1="25.1899" x2="18.987" y2="25.1899" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F6F1EF" />
            <stop offset="0.1" stopColor="white" />
            <stop offset="0.48" stopColor="#D1BAAE" />
            <stop offset="0.52" stopColor="#D1BAAE" />
            <stop offset="0.9" stopColor="white" />
            <stop offset="1" stopColor="#F6F1EF" />
          </linearGradient>
        </defs>
      </svg>
  ),
  "防晒": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="9.78906" y="4.7998" width="28.3998" height="38.3997" rx="9.99984" fill={`url(#paint0_radial_2121_4267_${idSuffix})`} />
        <path d="M11.9902 19C11.9902 19 15.1902 18 23.9901 18C32.7901 18 35.9901 19 35.9901 19" stroke="#DBBBA4" strokeWidth="1.19998" strokeLinecap="round" />
        <path d="M23.7381 4C12.9882 4 10.5798 10.6337 9.7382 13.9999C8.89665 17.3661 8.87818 30.5597 9.7382 33.9998C10.5982 37.4399 12.9882 43.9997 23.7381 43.9997" stroke="#DBBBA4" strokeWidth="1.59997" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.9881 4C34.738 4 37.1464 10.6337 37.988 13.9999C38.8295 17.3661 38.848 30.5597 37.988 33.9998C37.128 37.4399 34.738 43.9997 23.9881 43.9997" stroke="#DBBBA4" strokeWidth="1.59997" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <radialGradient id={`paint0_radial_2121_4267_${idSuffix}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(23.989 23.9997) rotate(180) scale(14.1999 19.1999)">
            <stop stopColor="#F1D7C4" />
            <stop offset="0.826923" stopColor="#FAF5F2" />
            <stop offset="1" stopColor="#F8F1ED" />
          </radialGradient>
        </defs>
      </svg>
  ),
  "身体乳": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18.7954" y="2" width="10.4" height="44" fill={`url(#paint0_linear_2121_4179_${idSuffix})`} />
        <path d="M17.9945 3.82842C17.9945 3.29799 18.2285 2.80528 18.7276 2.62557C19.516 2.34166 21.0719 2 23.9945 2C26.9171 2 28.473 2.34166 29.2615 2.62557C29.7605 2.80528 29.9945 3.29799 29.9945 3.82842V44C29.9945 45.1046 29.0991 46 27.9945 46H19.9945C18.8899 46 17.9945 45.1046 17.9945 44V3.82842Z" stroke="#C1AFA1" strokeWidth="1.59998" strokeLinejoin="round" />
        <path d="M19.9948 9.80092C19.9948 9.80092 20.9946 9.50098 23.9941 9.50098C26.9935 9.50098 27.9934 9.80092 27.9934 9.80092" stroke="#C1AFA1" strokeWidth="1.19999" strokeLinecap="round" />
        <circle cx="23.9955" cy="5.00131" r="1.00034" stroke="#C1AFA1" strokeWidth="0.999991" />
        <defs>
          <linearGradient id={`paint0_linear_2121_4179_${idSuffix}`} x1="29.1954" y1="24" x2="18.7954" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F5F0EC" />
            <stop offset="0.1" stopColor="white" />
            <stop offset="0.45" stopColor="#DBCCBF" />
            <stop offset="0.55" stopColor="#DBCCBF" />
            <stop offset="0.9" stopColor="white" />
            <stop offset="1" stopColor="#F5F0EC" />
          </linearGradient>
        </defs>
      </svg>
  ),
  "磨砂膏": (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5.69531" y="13.999" width="36.5979" height="19.7989" rx="1.99982" fill={`url(#paint0_linear_2121_4220_${idSuffix})`} />
        <path d="M7.99721 14.0407C10.7442 13.738 15.6787 13.3984 23.9931 13.3984C32.2237 13.3984 37.1422 13.6995 39.9053 13.9713C41.7318 14.1509 42.992 15.6859 42.992 17.5212V31.3975C42.992 33.0542 41.649 34.3973 39.9923 34.3973H7.99387C6.33717 34.3973 4.99414 33.0542 4.99414 31.3975V17.548C4.99414 15.7493 6.20935 14.2378 7.99721 14.0407Z" stroke="#BFBAB6" strokeWidth="1.59986" />
        <path d="M7.99414 21.8984C7.99414 21.8984 14.5493 21.3984 23.9932 21.3984C33.4372 21.3984 39.9923 21.8984 39.9923 21.8984" stroke="#BFBAB6" strokeWidth="1.19989" strokeLinecap="round" />
        <defs>
          <linearGradient id={`paint0_linear_2121_4220_${idSuffix}`} x1="42.2932" y1="23.8985" x2="5.69531" y2="23.8985" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2F1F0" />
            <stop offset="0.1" stopColor="white" />
            <stop offset="0.5" stopColor="#CECBC8" />
            <stop offset="0.9" stopColor="white" />
            <stop offset="1" stopColor="#F2F1F0" />
          </linearGradient>
        </defs>
      </svg>
  ),
  "护理油": (
    <svg width="48" height="48" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M224.841 51.218H175.082C171.534 51.218 168.658 54.0941 168.658 57.642V173.865C168.658 177.413 171.534 180.289 175.082 180.289H224.841C228.389 180.289 231.265 177.413 231.265 173.865V57.642C231.265 54.0941 228.389 51.218 224.841 51.218Z" fill={`url(#paint0_linear_22_2_${idSuffix})`} />
        <path d="M262.405 186.466H137.594C133.539 186.466 130.252 189.753 130.252 193.808V345.634C130.252 349.689 133.539 352.976 137.594 352.976H262.405C266.46 352.976 269.747 349.689 269.747 345.634V193.808C269.747 189.753 266.46 186.466 262.405 186.466Z" fill={`url(#paint1_radial_22_2_${idSuffix})`} />
        <path d="M262.405 186.466H137.594C133.539 186.466 130.252 189.753 130.252 193.808V345.634C130.252 349.689 133.539 352.976 137.594 352.976H262.405C266.46 352.976 269.747 349.689 269.747 345.634V193.808C269.747 189.753 266.46 186.466 262.405 186.466Z" fill={`url(#paint2_linear_22_2_${idSuffix})`} fillOpacity="0.6" />
        <path d="M132.857 199.91C132.857 196.385 134.165 192.989 137.226 191.243C144.329 187.19 161.651 180.748 200 180.748C238.349 180.748 255.67 187.19 262.774 191.243C265.835 192.989 267.142 196.385 267.142 199.91V338.904C267.142 347.352 260.294 354.2 251.847 354.2H148.153C139.705 354.2 132.857 347.352 132.857 338.904V199.91Z" stroke="#355826" strokeWidth="13.33" strokeLinejoin="round" />
        <path d="M188.069 72.456C188.069 72.456 191.649 71.538 200 71.538C208.351 71.538 211.93 72.456 211.93 72.456" stroke="#383F36" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M152.344 202.315C152.344 202.315 166.641 201.397 200 201.397C233.359 201.397 247.656 202.315 247.656 202.315" stroke="#355826" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M199.955 46.3C190.409 46.3 180.864 49.478 176.606 51.602C175.358 52.224 174.717 53.535 174.717 54.929V70.62C170.886 71.089 167.594 72.421 165.284 74.505C164.507 75.205 164.155 76.224 164.149 77.27C164.087 87.712 164.131 137.955 164.163 164.229L162.787 166.982V180.289H200H237.213V166.982L235.837 164.229C235.869 137.955 235.913 87.712 235.851 77.27C235.845 76.224 235.493 75.205 234.716 74.505C232.406 72.421 229.114 71.089 225.283 70.62V54.929C225.283 53.535 224.642 52.224 223.394 51.602C219.136 49.478 209.591 46.3 200.045 46.3" stroke="#383F36" strokeWidth="13.33" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id={`paint0_linear_22_2_${idSuffix}`} x1="231.264" y1="115.754" x2="168.658" y2="115.754" gradientUnits="userSpaceOnUse">
            <stop offset="0.1" stopColor="#697265" />
            <stop offset="0.2" stopColor="#95A196" />
            <stop offset="0.45" stopColor="#364335" />
            <stop offset="0.55" stopColor="#364335" />
            <stop offset="0.8" stopColor="#95A196" />
            <stop offset="0.9" stopColor="#697265" />
          </linearGradient>
          <radialGradient id={`paint1_radial_22_2_${idSuffix}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 317.499) rotate(-90) scale(131.034 69.7474)">
            <stop stopColor="#30482E" />
            <stop offset="0.862" stopColor="#8DA77E" />
          </radialGradient>
          <linearGradient id={`paint2_linear_22_2_${idSuffix}`} x1="263.622" y1="261.216" x2="136.098" y2="261.216" gradientUnits="userSpaceOnUse">
            <stop stopColor="#30482E" />
            <stop offset="0.524" stopColor="#B5F68E" stopOpacity="0" />
            <stop offset="1" stopColor="#30482E" />
          </linearGradient>
        </defs>
      </svg>
  ),
};

interface OrbitalRingProps {
  radius: number;
  duration: number;
  reverse?: boolean;
  items: { icon: React.ReactNode; angle: number }[];
  className?: string;
}

function OrbitalRing({ radius, duration, reverse, items, className }: OrbitalRingProps) {
  return (
    <div
      className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", className)}
      style={{
        width: radius * 2,
        height: radius * 2,
      }}
    >
      <div
        className="absolute inset-0 rounded-full border border-brand-charcoal/[0.06]"
        style={{ animation: `none` }}
      />
      <div
        className="absolute inset-0"
        style={{
          animation: `orbit-spin ${duration}s linear infinite ${reverse ? "reverse" : ""}`,
        }}
      >
        {items.map((item, i) => {
          const rad = (item.angle * Math.PI) / 180;
          const x = Number((Math.cos(rad) * radius).toFixed(2));
          const y = Number((Math.sin(rad) * radius).toFixed(2));
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16"
                style={{
                  animation: `orbit-spin ${duration}s linear infinite ${reverse ? "" : "reverse"}`,
                }}
              >
                <div className="h-12 w-12 sm:h-14 sm:w-14">{item.icon}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface OrbitalIconsProps {
  className?: string;
  children?: React.ReactNode;
}

export function OrbitalIcons({ className, children }: OrbitalIconsProps) {
  const rings: OrbitalRingProps[] = [
    {
      radius: 260,
      duration: 28,
      items: [
        { icon: CATEGORY_ICONS["洁面"], angle: 0 },
        { icon: CATEGORY_ICONS["面霜"], angle: 90 },
        { icon: CATEGORY_ICONS["精华露"], angle: 180 },
        { icon: CATEGORY_ICONS["面膜"], angle: 270 },
      ],
    },
    {
      radius: 370,
      duration: 42,
      reverse: true,
      items: [
        { icon: CATEGORY_ICONS["护手霜"], angle: 0 },
        { icon: CATEGORY_ICONS["防晒"], angle: 72 },
        { icon: CATEGORY_ICONS["身体乳"], angle: 144 },
        { icon: CATEGORY_ICONS["磨砂膏"], angle: 216 },
        { icon: CATEGORY_ICONS["护理油"], angle: 288 },
      ],
    },
  ];

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
      {rings.map((ring, i) => (
        <OrbitalRing key={i} {...ring} />
      ))}
    </div>
  );
}
