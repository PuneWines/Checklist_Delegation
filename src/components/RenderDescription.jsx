import React, { useState } from 'react';
import { Play, FileText, Image as ImageIcon, Link as LinkIcon, X, Maximize2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AudioPlayer from './AudioPlayer';

const MediaViewer = ({ isOpen, onClose, media }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">
                                {media.type === 'video' ? <Play size={16} fill="currentColor" /> : 
                                    media.type === 'image' || media.type === 'image/jpeg' || media.type === 'image/png' ? <ImageIcon size={16} /> : <FileText size={16} />}
                            </div>
                            <span className="text-sm font-black text-gray-800 uppercase tracking-tight">
                                {media.type.split('/')[0]} Viewer
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => window.open(media.url, '_blank')}
                                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                title="Open in new tab"
                            >
                                <ExternalLink size={18} />
                            </button>
                            <button 
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Modal Content */}
                    <div className="flex-grow overflow-auto flex items-center justify-center bg-gray-900 p-1 sm:p-4 min-h-[300px]">
                        {media.type === 'video' ? (
                            <video 
                                src={media.url} 
                                controls 
                                autoPlay 
                                className="max-w-full max-h-[70vh] rounded-lg shadow-lg"
                            />
                        ) : media.type.startsWith('image') || media.type === 'image' ? (
                            <img 
                                src={media.url} 
                                alt="Shared Media" 
                                className="max-w-full max-h-[70vh] object-contain rounded-md shadow-lg"
                            />
                        ) : (
                            <iframe 
                                src={media.url} 
                                className="w-full h-[70vh] rounded-md bg-white border-none shadow-inner"
                                title="Document Viewer"
                            />
                        )}
                    </div>
                    
                    {/* Footer hint */}
                    <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            Click anywhere outside to close
                        </p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

/**
 * Shared component to safely render task descriptions, audio notes, 
 * and multiple reference attachments with a built-in media viewer popup.
 */
const RenderDescription = ({ text, audioUrl, instructionUrl, instructionType }) => {
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerMedia, setViewerMedia] = useState({ url: '', type: '' });

    if (!text && !audioUrl && !instructionUrl) return <span className="text-gray-400">—</span>;

    // Detect legacy audio links in the description text
    const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|wav|ogg|webm|m4a|aac)(\?.*)?)/i;
    let match = null;
    if (text && typeof text === 'string') {
        match = text.match(urlRegex);
    }

    let url = audioUrl || (match ? match[0] : null);
    let cleanText = text || '';

    if (match && !audioUrl) {
        cleanText = text.replace(match[0], '')
            .replace(/Voice Note Link:/i, '')
            .replace(/Voice Note:/i, '')
            .trim();
    }

    const openViewer = (url, type) => {
        if (type === 'link') {
            window.open(url, '_blank');
            return;
        }
        setViewerMedia({ url, type });
        setViewerOpen(true);
    };

    const renderInstruction = () => {
        if (!instructionUrl || !instructionType || instructionType === 'none') return null;
        let urls = [];
        let types = [];
        try {
            urls = JSON.parse(instructionUrl);
            types = JSON.parse(instructionType);
            if (!Array.isArray(urls)) {
                urls = [instructionUrl];
                types = [instructionType];
            }
        } catch (e) {
            urls = [instructionUrl];
            types = [instructionType];
        }

        return (
            <div className="flex flex-wrap gap-2 mt-2">
                {urls.map((attachmentUrl, idx) => {
                    const type = types[idx] || 'link';
                    let iconLabel = "Reference";
                    let Icon = LinkIcon;

                    if (type === 'video') {
                        iconLabel = "Video";
                        Icon = Play;
                    } else if (type === 'image') {
                        iconLabel = "Image";
                        Icon = ImageIcon;
                    } else if (type === 'pdf') {
                        iconLabel = "Doc/PDF";
                        Icon = FileText;
                    }

                    return (
                        <button
                            key={idx}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openViewer(attachmentUrl, type);
                            }}
                            className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 hover:shadow-sm transition-all shadow-sm w-fit"
                            title={`View ${iconLabel}`}
                        >
                            <Icon size={12} strokeWidth={2.5} />
                            {iconLabel}
                        </button>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex flex-col min-w-[180px] max-w-full">
            {cleanText && (
                <span className="whitespace-pre-wrap text-[13px] font-medium text-gray-800 leading-relaxed mb-1.5">
                    {cleanText}
                </span>
            )}
            
            <div className="flex flex-wrap items-center gap-2">
                {url && <AudioPlayer className="!min-w-0" url={url} />}
                {renderInstruction()}
            </div>

            <MediaViewer 
                isOpen={viewerOpen} 
                onClose={() => setViewerOpen(false)} 
                media={viewerMedia} 
            />
        </div>
    );
};

export { MediaViewer };
export default RenderDescription;
