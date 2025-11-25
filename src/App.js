import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [downloadReady, setDownloadReady] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const socketRef = useRef(null);


  const placeholders = {
    tiktok: "Paste your TikTok video link here",
    instagram: "Paste your Instagram video link here",
    facebook: "Paste your Facebook video link here",
    youtube: "Paste your YouTube video link here",
    twitter: "Paste your X (Twitter) video link here"
  };

  const detectPlatform = (url) => {
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('facebook.com')) return 'facebook';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    return 'auto';
  };

  
  const setActivePlatform = (platform) => {
    setPlatform(platform);
    if (platform !== 'auto' && placeholders[platform]) {
      document.getElementById('urlInput').placeholder = placeholders[platform];
    } else {
      document.getElementById('urlInput').placeholder = "Paste your video link here (YouTube, TikTok, Instagram...)";
    }
  };

  // Valider l'URL
  const isValidUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Coller depuis le presse-papier
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setError('');
        // Détecter automatiquement la plateforme
        const detectedPlatform = detectPlatform(text);
        if (detectedPlatform !== 'auto') {
          setPlatform(detectedPlatform);
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  // Effacer le champ URL
  const handleClear = () => {
    setUrl('');
    setError('');
    setVideoInfo(null);
    setQualities([]);
    setDownloadReady(false);
    setSelectedQuality('');
    setLoading(false);
    setProgress(0);
  };

  // Initialiser la connexion Socket.io
  useEffect(() => {
    socketRef.current = io('http://localhost:5000', {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    
    socketRef.current.on('connect', () => {
      console.log('✅ [Frontend] Connected to server, Socket ID:', socketRef.current.id);
    });
    
    // Gestionnaire de reconnexion
    socketRef.current.on('reconnect', (attempt) => {
      console.log(`✅ [Socket] Reconnected after ${attempt} attempts`);
      if (jobId) {
        // Rejoindre la room après reconnexion
        socketRef.current.emit('join-download-room', jobId);
      }
    });
    
    socketRef.current.on('disconnect', () => {
      console.log('❌ [Frontend] Disconnected from server');
    });
    
    socketRef.current.on('download-progress', (data) => {
      console.log(`📊 [Frontend] Progress received: ${data.progress}% for job: ${data.jobId}`);
      if (data.jobId === jobId) {
        setProgress(data.progress);
      }
    });
    
    socketRef.current.on('download-complete', (data) => {
      console.log(`✅ [Frontend] Download complete for job: ${data.jobId}`, data.result);
      if (data.jobId === jobId) {
        setVideoInfo(data.result);
        setProgress(100);
        setDownloadReady(true);
        setLoading(false);
        
        // Déclencher le téléchargement automatiquement
        handleDownload();
      }
    });
    
    socketRef.current.on('download-error', (data) => {
      console.log(`❌ [Frontend] Download error for job: ${data.jobId}`, data.error);
      if (data.jobId === jobId) {
        setError(data.error);
        setProgress(0);
        setLoading(false);
      }
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [jobId]);

  // Nouvelle fonction pour récupérer les infos vidéo
  const fetchVideoInfo = async (url) => {
    try {
      console.log(`🌐 [Frontend] Fetching video info for: ${url}`);
      const response = await fetch(`http://localhost:5000/api/download/qualities?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ [Frontend] Video info fetched successfully:`, data);
      return data;
    } catch (error) {
      console.error('Error fetching video info:', error);
      throw new Error(error.message || 'Failed to fetch video information');
    }
  };

  // Lancer le téléchargement
  const startDownload = async (url, quality) => {
    try {
      console.log(`🚀 [Frontend] Starting download for URL: ${url} Quality: ${quality}`);
      
      const response = await fetch('http://localhost:5000/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url, 
          quality: quality || '720p',
          socketId: socketRef.current?.id 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setJobId(data.jobId);
      console.log(`✅ [Frontend] Job created successfully, Job ID: ${data.jobId}`);
      
      // Rejoindre la room de téléchargement
      if (socketRef.current) {
        socketRef.current.emit('join-download-room', data.jobId);
        console.log(`📋 [Frontend] Joining download room: ${data.jobId}`);
      }
      
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors du traitement');
      setLoading(false);
      throw err;
    }
  };

  // Gérer la soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Veuillez entrer une URL');
      return;
    }
    
    if (!isValidUrl(url)) {
      setError('URL invalide. Veuillez réessayer.');
      return;
    }
    
    setLoading(true);
    setFetchingInfo(true);
    setError('');
    setVideoInfo(null);
    setQualities([]);
    setDownloadReady(false);
    setProgress(0);
    setSelectedQuality('');
    
    try {
      // Détecter la plateforme
      const detectedPlatform = detectPlatform(url);
      setPlatform(detectedPlatform);
      
      // Obtenir les informations de la vidéo (qualités + infos)
      const videoData = await fetchVideoInfo(url);
      setQualities(videoData.qualities || []);
      setVideoInfo(videoData); // Stocker les infos pour l'aperçu
      
      // Sélectionner la meilleure qualité par défaut
      if (videoData.qualities && videoData.qualities.length > 0) {
        const bestQuality = videoData.qualities[videoData.qualities.length - 1];
        setSelectedQuality(bestQuality);
      }
      
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de la récupération des informations');
    } finally {
      setLoading(false);
      setFetchingInfo(false);
    }
  };

  // Modifier la fonction startDownload pour qu'elle ne soit appelée que quand l'utilisateur confirme
  const handleStartDownload = async () => {
    if (!url || !selectedQuality) return;
    
    setLoading(true);
    setProgress(0);
    setDownloadReady(false);
    
    try {
      await startDownload(url, selectedQuality);
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors du téléchargement');
      setLoading(false);
    }
  };

  // Gérer le téléchargement final
  const handleDownload = () => {
    if (!videoInfo || !videoInfo.downloadUrl) return;
    
    // Utiliser l'URL de téléchargement fournie par le backend
    const directDownloadUrl = videoInfo.downloadUrl;
    
    // Créer un lien invisible pour déclencher le téléchargement
    const link = document.createElement('a');
    link.href = directDownloadUrl;
    link.setAttribute('download', '');
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Effet pour détecter la plateforme lorsque l'URL change
  useEffect(() => {
    if (url.trim() && platform === 'auto') {
      const detected = detectPlatform(url);
      if (detected !== 'auto') {
        setPlatform(detected);
      }
    }
  }, [url, platform]);

  return (
    <div className="App">
      <header>
        <div className="brand" aria-hidden="false">
          <div>Clipster</div>
        </div>
        
        <nav className="desktop" aria-label="menu principal">
          <a href="#" tabIndex="0" data-platform="tiktok" className={platform === 'tiktok' ? 'active' : ''} onClick={() => setActivePlatform('tiktok')}>TikTok</a>
          <a href="#" tabIndex="0" data-platform="instagram" className={platform === 'instagram' ? 'active' : ''} onClick={() => setActivePlatform('instagram')}>Instagram</a>
          <a href="#" tabIndex="0" data-platform="facebook" className={platform === 'facebook' ? 'active' : ''} onClick={() => setActivePlatform('facebook')}>Facebook</a>
          <a href="#" tabIndex="0" data-platform="youtube" className={platform === 'youtube' ? 'active' : ''} onClick={() => setActivePlatform('youtube')}>YouTube</a>
          <a href="#" tabIndex="0" data-platform="twitter" className={platform === 'twitter' ? 'active' : ''} onClick={() => setActivePlatform('twitter')}>X</a>
        </nav>
        
        <div className={`burger-menu ${mobileMenuOpen ? 'open' : ''}`} id="burgerMenu" aria-label="Menu mobile" role="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <div className="burger-line"></div>
          <div className="burger-line"></div>
          <div className="burger-line"></div>
        </div>
      </header>

      <nav className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`} id="mobileNav">
        <div className="close-menu" id="closeMenu" onClick={() => setMobileMenuOpen(false)}></div>
        <a href="#" data-platform="tiktok" className={platform === 'tiktok' ? 'active' : ''} onClick={() => { setActivePlatform('tiktok'); setMobileMenuOpen(false); }}>TikTok</a>
        <a href="#" data-platform="instagram" className={platform === 'instagram' ? 'active' : ''} onClick={() => { setActivePlatform('instagram'); setMobileMenuOpen(false); }}>Instagram</a>
        <a href="#" data-platform="facebook" className={platform === 'facebook' ? 'active' : ''} onClick={() => { setActivePlatform('facebook'); setMobileMenuOpen(false); }}>Facebook</a>
        <a href="#" data-platform="youtube" className={platform === 'youtube' ? 'active' : ''} onClick={() => { setActivePlatform('youtube'); setMobileMenuOpen(false); }}>YouTube</a>
        <a href="#" data-platform="twitter" className={platform === 'twitter' ? 'active' : ''} onClick={() => { setActivePlatform('twitter'); setMobileMenuOpen(false); }}>X</a>
      </nav>

      <main className="wrap" role="main">
        <h1>Free Online Video Downloader</h1>
        <p className="lead">Download videos quickly — Without watermark. Paste the link below.</p>

        <div className="hero-card" id="heroCard" role="region" aria-labelledby="heroTitle">
          <form onSubmit={handleSubmit}>
            <div className="field-container">
              <div className="field" id="inputField" style={error ? { borderColor: 'red' } : {}}>
                <input 
                  id="urlInput" 
                  type="url" 
                  inputMode="url" 
                  placeholder={placeholders[platform] || "Paste your video link here (YouTube, TikTok, Instagram...)"} 
                  aria-label="lien de la vidéo"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError('');
                  }}
                  style={error ? { color: 'red' } : {}}
                />
                <div className="paste-button" onClick={url ? handleClear : handlePaste}>
                  {url ? (
                    <span className="clear-icon">✕</span>
                  ) : (
                    <>
                      <span className="paste-icon">📋</span>
                      <span className="paste-text">Paste</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div style={{ color: 'red', fontSize: '14px', marginTop: '5px' }}>
                {error}
              </div>
            )}

            {/* Aperçu des informations vidéo - Afficher APRÈS la récupération des infos */}
            {videoInfo && !fetchingInfo && !downloadReady && (
              <div className="video____preview____card">
                <img 
                  src={videoInfo.thumbnail || 'https://via.placeholder.com/300x170/7ED321/FFFFFF?text=Video+Preview'} 
                  alt="Miniature" 
                  className="video____preview____image"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/300x170/7ED321/FFFFFF?text=Video+Preview';
                  }}
                />
                <div className="video____preview____category"> {platform} Video </div>
                <div className="video____preview____heading"> {videoInfo.title || 'Titre non disponible'}
                  <div className="video____preview____author"> Duration: <span className="video____preview____name">{videoInfo.duration || 'Inconnue'}</span></div>
                </div>
              </div>
            )}

            {/* Sélection de qualité - Afficher APRÈS la récupération des infos */}
            {qualities.length > 0 && !fetchingInfo && !downloadReady && (
              <div className="quality____selector">
                <p>Sélectionnez la qualité:</p>
                <div className="quality____buttons____container">
                  {qualities.map((quality, index) => (
                    <QualityButtonNew
                      key={index}
                      quality={quality}
                      isActive={selectedQuality === quality}
                      onClick={() => setSelectedQuality(quality)}
                    />
                  ))}
                </div>
                <div style={{display: 'flex', justifyContent: 'center', marginTop: '15px'}}>
                  <button 
                    type="button"
                    className="btn____start____download"
                    onClick={handleStartDownload}
                  >
                    <span className="btn____start____download____text">Start the download</span>
                  </button>
                </div>
              </div>
            )}

            {/* Barre de progression */}
            {loading && progress > 0 && progress < 100 && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-bar-inner" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="progress-text">{Math.round(progress)}%</div>
              </div>
            )}

            {/* Zone pour le preloader */}
            {(loading && progress === 0 && !videoInfo) && (
              <div className="loader____container____centered">
                <div className="loader">
                  <span className="baret"></span>
                  <span className="baret"></span>
                  <span className="baret"></span>
                </div>
                <p className="loader____text____centered">Initializing download...</p>
              </div>
            )}

            {downloadReady && videoInfo && (
              <div className="download____action____container">
                <button 
                  type="button"
                  className="download____button____final"
                  onClick={handleDownload}
                  data-text="Télécharger"
                >
                  <span className="download____actual____text">&nbsp;Download&nbsp;</span>
                  <span aria-hidden="true" className="download____hover____text">&nbsp;Download&nbsp;</span>
                </button>
              </div>
            )}

            <div className="dl-badge">
              <button 
                type="submit" 
                className="button type--C" 
                id="downloadBtn" 
                aria-describedby="downloadStatus"
                disabled={loading}
              >
                <div className="button__line"></div>
                <div className="button__line"></div>
                <span className="button__text">
                  {loading ? 'TRAITEMENT...' : 'TÉLÉCHARGER'}
                </span>
                <div className="button__drow1"></div>
                <div className="button__drow2"></div>
              </button>
            </div>
          </form>

          <div className="meta">By using our service you accept our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></div>
          <div className="security">Scanned by <strong>✔ Norton™ Safe Web</strong></div>
        </div>

        <div className="platforms" id="platforms" aria-label="plateformes supportées">
          <div className={`plat ${platform === 'facebook' ? 'active' : ''}`} data-site="facebook.com" tabIndex="0" role="button" aria-pressed={platform === 'facebook'} data-platform="facebook" onClick={() => setActivePlatform('facebook')}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
            <div className="url">Facebook</div>
            <div className="light-overlay"></div>
          </div>

          <div className={`plat ${platform === 'instagram' ? 'active' : ''}`} data-site="instagram.com" tabIndex="0" role="button" aria-pressed={platform === 'instagram'} data-platform="instagram" onClick={() => setActivePlatform('instagram')}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.8,2H16.2C19.4,2 22,4.6 22,7.8V16.2A5.8,5.8 0 0,1 16.2,22H7.8C4.6,22 2,19.4 2,16.2V7.8A5.8,5.8 0 0,1 7.8,2M7.6,4A3.6,3.6 0 0,0 4,7.6V16.4C4,18.39 5.61,20 7.6,20H16.4A3.6,3.6 0 0,0 20,16.4V7.6C20,5.61 18.39,4 16.4,4H7.6M17.25,5.5A1.25,1.25 0 0,1 18.5,6.75A1.25,1.25 0 0,1 17.25,8A1.25,1.25 0 0,1 16,6.75A1.25,1.25 0 0,1 17.25,5.5M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/>
            </svg>
            <div className="url">Instagram</div>
            <div className="light-overlay"></div>
          </div>

          <div className={`plat ${platform === 'youtube' ? 'active' : ''}`} data-site="youtube.com" tabIndex="0" role="button" aria-pressed={platform === 'youtube'} data-platform="youtube" onClick={() => setActivePlatform('youtube')}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z"/>
            </svg>
            <div className="url">YouTube</div>
            <div className="light-overlay"></div>
          </div>

          <div className={`plat ${platform === 'twitter' ? 'active' : ''}`} data-site="twitter.com" tabIndex="0" role="button" aria-pressed={platform === 'twitter'} data-platform="twitter" onClick={() => setActivePlatform('twitter')}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <div className="url">X</div>
            <div className="light-overlay"></div>
          </div>

          <div className={`plat ${platform === 'tiktok' ? 'active' : ''}`} data-site="tiktok.com" tabIndex="0" role="button" aria-pressed={platform === 'tiktok'} data-platform="tiktok" onClick={() => setActivePlatform('tiktok')}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.50 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.40-.67.41-1.06.10-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
            </svg>
            <div className="url">TikTok</div>
            <div className="light-overlay"></div>
          </div>
        </div>

        <section className="content-section" id="section1">
          <h2>Download Videos Easily with Clipster</h2>
          <p>Quickly capture your preferred online videos and audio content with Clipster, a dependable and established video downloading solution. Our powerful web-based utility enables you to download media directly from popular platforms without requiring any complex software. Whether you're using your desktop or mobile device, our intuitive interface makes preserving your favorite content effortless.</p>
          <p>From viral YouTube clips and popular series to must-see athletic highlights, Clipster manages everything. Simply copy the URL of your desired video, paste it into our download field, and click Download – it's that straightforward! Prefer even faster downloads? Explore our browser extension, which integrates seamlessly for one-click downloading convenience.</p>
        </section>

        <section className="content-section" id="section2">
          <h2>Download High-Quality MP4 Videos</h2>
          <p>Want to enjoy your preferred video content offline? While streaming offers convenience, saving videos directly to your device provides greater flexibility. Clipster's advanced video downloader ensures sharp, clear downloads, preserving the original high-definition quality when saving videos in the universal MP4 format.</p>
          <p>Take control of your viewing experience and enjoy your favorite media anytime, anywhere. Our premium conversion tool helps you build a personal library of high-definition MP4 videos that maintain the visual excellence of the originals. Whether you're traveling, experiencing connectivity issues, or simply prefer having your videos readily accessible, our service delivers the quality you expect and deserve.</p>
        </section>

        <div className="notifications-container">
          <div className="alert">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="alert-svg">
                  <path clipRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" fillRule="evenodd"></path>
                </svg>
              </div>
              <div className="alert-prompt-wrap">
                <p className="text-sm text-yellow-700">
                  Clipster is not affiliated with any social media platforms. By using our service, you agree to comply with the terms of service of the respective platforms and respect copyright laws. 
                  <a className="alert-prompt-link" href="#">Learn more</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="main-footer">
        <div className="footer-content">
          <div className="footer-logo">Clipster.net</div>
          <div className="footer-links">
            <a href="#" data-platform="tiktok" onClick={() => setActivePlatform('tiktok')}>TikTok</a>
            <a href="#" data-platform="instagram" onClick={() => setActivePlatform('instagram')}>Instagram</a>
            <a href="#" data-platform="facebook" onClick={() => setActivePlatform('facebook')}>Facebook</a>
            <a href="#" data-platform="youtube" onClick={() => setActivePlatform('youtube')}>YouTube</a>
            <a href="#" data-platform="twitter" onClick={() => setActivePlatform('twitter')}>X</a>
          </div>
          <div className="footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          © <strong>Clipster</strong> — Free online tools.
        </div>
      </footer>
    </div>
  );
}

// Nouveau composant pour les boutons de qualité avec le design spécial
const QualityButtonNew = ({ quality, isActive, onClick }) => {
  return (
    <button
      type="button"
      className={`quality____btn____new ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="quality____btn____new____lg">
        <span className="quality____btn____new____sl" />
        <span className="quality____btn____new____text">{quality}</span>
      </span>
    </button>
  );
};

export default App;