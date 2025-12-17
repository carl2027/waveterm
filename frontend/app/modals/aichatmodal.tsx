// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AIPanelInput } from "@/app/aipanel/aipanelinput";
import { AIPanelMessages } from "@/app/aipanel/aipanelmessages";
import { WaveAIModel } from "@/app/aipanel/waveai-model";
import { WaveUIMessage } from "@/app/aipanel/aitypes";
import { FlexiModal } from "@/app/modals/modal";
import { modalsModel } from "@/app/store/modalmodel";
import { atoms, globalStore } from "@/app/store/global";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { memo, useEffect, useRef, useState } from "react";

interface AIChatModalProps {
    initialText?: string;
}

const AIChatModal = memo(({ initialText }: AIChatModalProps) => {
    const model = WaveAIModel.getInstance();
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Create a separate chat instance for the modal
    const { messages, sendMessage, status, setMessages, error, stop } = useChat<WaveUIMessage>({
        transport: new DefaultChatTransport({
            api: model.getUseChatEndpointUrl(),
            prepareSendMessagesRequest: (opts) => {
                const msg = model.getAndClearMessage();
                const windowType = globalStore.get(atoms.waveWindowType);
                const body: any = {
                    msg,
                    chatid: globalStore.get(model.chatId),
                    widgetaccess: globalStore.get(model.widgetAccessAtom),
                };
                if (windowType === "builder") {
                    body.builderid = globalStore.get(atoms.builderId);
                    body.builderappid = globalStore.get(atoms.builderAppId);
                } else {
                    body.tabid = globalStore.get(atoms.staticTabId);
                }
                return { body };
            },
        }),
        onError: (error) => {
            console.error("AI Chat error:", error);
            model.setError(error.message || "An error occurred");
        },
    });

    // Register the chat functions with the model
    useEffect(() => {
        model.registerUseChatData(sendMessage, setMessages, status, stop);
    }, [model, sendMessage, setMessages, status, stop]);

    // Set initial text when modal opens
    useEffect(() => {
        if (initialText) {
            // Clear any existing input first
            globalStore.set(model.inputAtom, "");
            model.appendText(initialText, true);
        }
        setInitialLoadDone(true);
    }, [initialText, model]);

    // Handle ESC key to close modal
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeModal();
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await model.handleSubmit();
    };

    const closeModal = () => {
        modalsModel.popModal();
    };

    return (
        <FlexiModal className="ai-chat-modal" onClickBackdrop={closeModal} ref={modalRef}>
            <FlexiModal.Content>
                <div ref={containerRef} className="flex flex-col" style={{ height: "80vh", width: "90vw", maxWidth: "800px" }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-white">AI Chat</h2>
                        <button
                            onClick={closeModal}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Close (ESC)"
                        >
                            <i className="fa-sharp fa-solid fa-xmark text-lg"></i>
                        </button>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0 border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
                        {initialLoadDone && (
                            <>
                                {messages.length === 0 ? (
                                    <div className="flex-1 overflow-y-auto p-4 text-gray-400 text-center flex items-center justify-center">
                                        <p>Ask Wave AI anything...</p>
                                    </div>
                                ) : (
                                    <AIPanelMessages messages={messages} status={status} />
                                )}
                                <AIPanelInput onSubmit={handleSubmit} status={status} model={model} />
                            </>
                        )}
                    </div>
                </div>
            </FlexiModal.Content>
        </FlexiModal>
    );
});

AIChatModal.displayName = "AIChatModal";

export { AIChatModal };

